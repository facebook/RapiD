import { select as d3_select } from 'd3-selection';
import { Tiler } from '@rapid-sdk/math';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import RBush from 'rbush';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { utilFetchResponse } from '../util/index.js';

const accessToken = 'MLY|3376030635833192|f13ab0bdf6b2f7b99e0d8bd5868e1d88';
const apiUrl = 'https://graph.mapillary.com/';
const baseTileUrl = 'https://tiles.mapillary.com/maps/vtp';
const imageTileUrl = `${baseTileUrl}/mly1_public/2/{z}/{x}/{y}?access_token=${accessToken}`;
const mapFeatureTileUrl = `${baseTileUrl}/mly_map_feature_point/2/{z}/{x}/{y}?access_token=${accessToken}`;
const trafficSignTileUrl = `${baseTileUrl}/mly_map_feature_traffic_sign/2/{z}/{x}/{y}?access_token=${accessToken}`;

const TILEZOOM = 14;


/**
 * `MapillaryService`
 *
 * Events available:
 *   `imageChanged`
 *   `bearingChanged`
 *   `loadedImages`
 *   `loadedSigns`
 *   `loadedMapFeatures`
 */
export class MapillaryService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'mapillary';

    this._loadPromise = null;
    this._startPromise = null;

    this._showing = null;
    this._mlyCache = {};
    this._mlyHighlightedDetection = null;
    this._mlyShowFeatureDetections = false;
    this._mlyShowSignDetections = false;

    this._viewer = null;
    this._viewerFilter = ['all'];
    this._keydown = this._keydown.bind(this);
    this._tiler = new Tiler().zoomRange(TILEZOOM).skipNullIsland(true);
    this._lastv = null;

    // Make sure the event handlers have `this` bound correctly
    this.navigateForward = this.navigateForward.bind(this);
    this.navigateBackward = this.navigateBackward.bind(this);
  }


  /**
   * _keydown
   * Handler for keydown events on the window, but only if the photo viewer is visible.
   * @param  `e`  A DOM KeyboardEvent
   */
  _keydown(e) {
    // Only allow key navigation if the user doesn't have something
    // more important focused - like a input, textarea, menu, etc.
    // and only allow key nav if we're showing the viewer and have the body or the map clicked
    const activeElement = document.activeElement?.tagName ?? 'BODY';
    const mapillaryViewerClass = document.activeElement?.className.startsWith('mapillary');

    if (
      (activeElement !== 'BODY' && !mapillaryViewerClass) ||
      !this.viewerShowing ||
      !this.context.systems.photos._currLayerID?.startsWith('mapillary')
    ) {
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      this.navigateBackward();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      this.navigateForward();
    }
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    return this.resetAsync();
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    if (this._startPromise) return this._startPromise;

    const context = this.context;
    const map = context.systems.map;
    const eventManager = map.renderer.events;

    // add mly-wrapper
    context.container().select('.photoviewer')
      .selectAll('.mly-wrapper')
      .data([0])
      .enter()
      .append('div')
      .attr('id', 'rapideditor-mly')
      .attr('class', 'photo-wrapper mly-wrapper')
      .classed('hide', true);

    eventManager.on('keydown', this._keydown);

    return this._startPromise = this._loadAssetsAsync()
      .then(() => this._initViewer())
      .then(() => this._started = true)
      .catch(err => {
        if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
        this._startPromise = null;
      });
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    if (this._mlyCache.requests) {
      Object.values(this._mlyCache.requests.inflight).forEach(function(request) { request.abort(); });
    }

    this._mlyCache = {
      images: { rtree: new RBush(), forImageID: {} },
      signs:  { rtree: new RBush() },
      points: { rtree: new RBush() },
      sequences: new Map(),    // Map(sequenceID -> Array of LineStrings)
      image_detections: { forImageID: {} },
      requests: { loaded: {}, inflight: {} }
    };

    this._lastv = null;

    return Promise.resolve();
  }


  /**
   * getData
   * Get already loaded data that appears in the current map view
   * @param   {string}  datasetID - one of 'images', 'signs', or 'points'
   * @return  {Array}
   */
  getData(datasetID) {
    if (!['images', 'signs', 'points'].includes(datasetID)) return [];

    const extent = this.context.viewport.visibleExtent();
    const cache = this._mlyCache[datasetID];
    return cache.rtree.search(extent.bbox()).map(d => d.data);
  }


  /**
   * getSequences
   * Get already loaded sequence data that appears in the current map view
   * @return  {Array}
   */
  getSequences() {
    const extent = this.context.viewport.visibleExtent();
    let result = new Map();  // Map(sequenceID -> Array of LineStrings)

    for (const box of this._mlyCache.images.rtree.search(extent.bbox())) {
      const sequenceID = box.data.sequenceID;
      if (!sequenceID) continue;  // no sequence for this image
      const sequence = this._mlyCache.sequences.get(sequenceID);
      if (!sequence) continue;  // sequence not ready

      if (!result.has(sequenceID)) {
        result.set(sequenceID, sequence);
      }
    }

    return [...result.values()];
  }


  /**
   * loadTiles
   * Schedule any data requests needed to cover the current map view
   * @param   {string}  datasetID - one of 'images', 'signs', or 'points'
   */
  loadTiles(datasetID) {
    if (!['images', 'signs', 'points'].includes(datasetID)) return;

    const viewport = this.context.viewport;
    if (this._lastv === viewport.v) return;  // exit early if the view is unchanged
    this._lastv = viewport.v;

    // Determine the tiles needed to cover the view..
    const tiles = this._tiler.getTiles(viewport).tiles;
    for (const tile of tiles) {
      this._loadTile(datasetID, tile);
    }
  }


  /**
   * resetTags
   * Remove highlghted detections from the Mapillary viewer
   */
  resetTags() {
    if (this._viewer) {
      this._viewer.getComponent('tag').removeAll();
    }
  }


  /**
   * showFeatureDetections
   * Show highlghted detections in the Mapillary viewer
   * @param  {Boolean}  `true` to show them, `false` to hide them
   */
  showFeatureDetections(value) {
    this._mlyShowFeatureDetections = value;
    if (!this._mlyShowFeatureDetections && !this._mlyShowSignDetections) {
      this.resetTags();
    }
  }


  /**
   * showSignDetections
   * Show highlghted traffic signs in the Mapillary viewer
   * @param  {Boolean}  `true` to show them, `false` to hide them
   */
  showSignDetections(value) {
    this._mlyShowSignDetections = value;
    if (!this._mlyShowFeatureDetections && !this._mlyShowSignDetections) {
      this.resetTags();
    }
  }


  /**
   * filterViewer
   * Apply filters to the Mapillary viewer
   * The filters settings are stored in the PhotoSystem
   */
  filterViewer() {
    const photos = this.context.systems.photos;
    const showsPano = photos.showsPanoramic;
    const showsFlat = photos.showsFlat;
    const fromDate = photos.fromDate;
    const toDate = photos.toDate;
    const filter = ['all'];

    if (!showsPano) filter.push([ '!=', 'cameraType', 'spherical' ]);
    if (!showsFlat && showsPano) filter.push(['==', 'pano', true]);
    if (fromDate) {
      filter.push(['>=', 'capturedAt', new Date(fromDate).getTime()]);
    }
    if (toDate) {
      filter.push(['>=', 'capturedAt', new Date(toDate).getTime()]);
    }

    if (this._viewer) {
      this._viewer.setFilter(filter);
    }
    this._viewerFilter = filter;

    return filter;
  }


  navigateForward() {
    const next = window.mapillary.NavigationDirection.Next;
    this._navigate(next);
  }

  navigateBackward() {
    const prev = window.mapillary.NavigationDirection.Prev;
    this._navigate(prev);
  }

  _navigate(dir) {
    this._viewer.moveDir(dir).catch(
      error => { //errs out if end of sequence reached, just don't print anything
      },
    );
  }

  get viewerShowing()  {
    return this._showing;
  }


  /**
   * showViewer
   * Shows the photo viewer, and hides all other photo viewers
   */
  showViewer() {
    const $viewerContainer = this.context.container().select('.photoviewer')
      .classed('hide', false);

    const isHidden = $viewerContainer.selectAll('.photo-wrapper.mly-wrapper.hide').size();

    if (isHidden && this._viewer) {
      $viewerContainer
        .selectAll('.photo-wrapper:not(.mly-wrapper)')
        .classed('hide', true);

      $viewerContainer
        .selectAll('.photo-wrapper.mly-wrapper')
        .classed('hide', false);

      this._showing = true;

      this._viewer.resize();
    }
  }


  /**
   * hideViewer
   * Hides the photo viewer and clears the currently selected image
   */
  hideViewer() {
    const context = this.context;
    context.systems.photos.selectPhoto(null);

    if (this._viewer) {
      this._viewer.getComponent('sequence').stop();
    }

    const $viewerContainer = context.container().select('.photoviewer');
    if (!$viewerContainer.empty()) $viewerContainer.datum(null);

    $viewerContainer
      .classed('hide', true)
      .selectAll('.photo-wrapper')
      .classed('hide', true);

    this._showing = false;
    this.emit('imageChanged');
  }


  // Highlight the detection in the viewer that is related to the clicked map feature
  highlightDetection(detection) {
    if (detection) {
      this._mlyHighlightedDetection = detection.id;
    }
    return this;
  }


  /**
   * selectImageAsync
   * Note:  most code should call `PhotoSystem.selectPhoto(layerID, photoID)` instead.
   * That will manage the state of what the user clicked on, and then call this function.
   * @param  {string} imageID - the id of the image to select
   * @return {Promise} Promise that always resolves (we should change this to resolve after the image is ready)
   */
  selectImageAsync(imageID) {
    if (!imageID) return Promise.resolve();  // do nothing

    return this.startAsync()
      .then(() => {
        return this._viewer
          .moveTo(imageID)
          .catch(err => console.error('mly3', err));   // eslint-disable-line no-console
      });
  }


  // Return a list of detection objects for the given id
  getDetectionsAsync(id) {
    return this._loadDataAsync(`${apiUrl}/${id}/detections?access_token=${accessToken}&fields=id,value,image`);
  }


  // Get detections for the current image and shows them in the image viewer
  _updateDetections(imageID) {
    if (!this._viewer) return;
    if (!imageID) return;

    const url = `${apiUrl}/${imageID}/detections?access_token=${accessToken}&fields=id,image,geometry,value`;
    const cache = this._mlyCache.image_detections;
    let detections = cache.forImageID[imageID];

    if (detections) {
      this._showDetections(detections);
    } else {
      this._loadDataAsync(url)
        .then(results => {
          for (const result of results) {
            if (!cache.forImageID[imageID]) {
              cache.forImageID[imageID] = [];
            }
            cache.forImageID[imageID].push({
              id: result.id,
              geometry: result.geometry,
              image_id: imageID,
              value: result.value
            });
          }

          this._showDetections(cache.forImageID[imageID] || []);
        });
    }
  }

  // Create a tag for each detection and shows it in the image viewer
  _showDetections(detections) {
    const tagComponent = this._viewer.getComponent('tag');
    for (const data of detections) {
      const tag = this._makeTag(data);
      if (tag) {
        tagComponent.add([tag]);
      }
    }
  }

    // Create a Mapillary JS tag object
  _makeTag(data) {
    const valueParts = data.value.split('--');
    if (!valueParts.length) return;

    let tag;
    let text;
    let color = 0xffffff;

    if (this._mlyHighlightedDetection === data.id) {
      color = 0xffff00;
      text = valueParts[1];
      if (text === 'flat' || text === 'discrete' || text === 'sign') {
        text = valueParts[2];
      }
      text = text.replace(/-/g, ' ');
      text = text.charAt(0).toUpperCase() + text.slice(1);
      this._mlyHighlightedDetection = null;
    }

    const decodedGeometry = window.atob(data.geometry);
    let uintArray = new Uint8Array(decodedGeometry.length);
    for (let i = 0; i < decodedGeometry.length; i++) {
      uintArray[i] = decodedGeometry.charCodeAt(i);
    }
    const tile = new VectorTile(new Protobuf(uintArray.buffer));
    const layer = tile.layers['mpy-or'];
    const geometries = layer.feature(0).loadGeometry();
    const polygon = geometries
      .map(ring => ring.map(point => [point.x / layer.extent, point.y / layer.extent]));

    const mapillary = window.mapillary;
    tag = new mapillary.OutlineTag(
      data.id,
      new mapillary.PolygonGeometry(polygon[0]), {
        text: text,
        textColor: color,
        lineColor: color,
        lineWidth: 2,
        fillColor: color,
        fillOpacity: 0.3,
      }
    );

    return tag;
  }


  // Load all data for the specified type from one vector tile
  _loadTile(datasetID, tile) {
    if (!['images', 'signs', 'points'].includes(datasetID)) return;

    const cache = this._mlyCache.requests;
    const tileID = `${tile.id}-${datasetID}`;
    if (cache.loaded[tileID] || cache.inflight[tileID]) return;

    const controller = new AbortController();
    cache.inflight[tileID] = controller;

    let url = {
      images: imageTileUrl,
      signs: trafficSignTileUrl,
      points: mapFeatureTileUrl
    }[datasetID];

    url = url
      .replace('{x}', tile.xyz[0])
      .replace('{y}', tile.xyz[1])
      .replace('{z}', tile.xyz[2]);

    fetch(url, { signal: controller.signal })
      .then(utilFetchResponse)
      .then(buffer => {
        cache.loaded[tileID] = true;
        if (!buffer) {
          throw new Error('No Data');
        }

        this._loadTileDataToCache(buffer, tile);

        this.context.deferredRedraw();
        if (datasetID === 'images') {
          this.emit('loadedImages');
        } else if (datasetID === 'signs') {
          this.emit('loadedSigns');
        } else if (datasetID === 'points') {
          this.emit('loadedMapFeatures');
        }
      })
      .catch(err => {
        if (err.name === 'AbortError') return;          // ok
        if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
        cache.loaded[tileID] = true;  // don't retry
      })
      .finally(() => {
        delete cache.inflight[tileID];
      });
  }


  // Load the data from the vector tile into cache
  _loadTileDataToCache(buffer, tile) {
    const vectorTile = new VectorTile(new Protobuf(buffer));

    if (vectorTile.layers.hasOwnProperty('image')) {
      const cache = this._mlyCache.images;
      const layer = vectorTile.layers.image;
      let boxes = [];

      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i).toGeoJSON(tile.xyz[0], tile.xyz[1], tile.xyz[2]);
        if (!feature) continue;
        if (cache.forImageID[feature.properties.id] !== undefined) continue;  // seen already

        const loc = feature.geometry.coordinates;
        const d = {
          type: 'photo',
          id: feature.properties.id.toString(),
          loc: loc,
          captured_at: feature.properties.captured_at,
          ca: feature.properties.compass_angle,
          isPano: feature.properties.is_pano,
          sequenceID: feature.properties.sequence_id,
        };
        cache.forImageID[d.id] = d;
        boxes.push({ minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1], data: d });
      }
      cache.rtree.load(boxes);
    }

    if (vectorTile.layers.hasOwnProperty('sequence')) {
      const cache = this._mlyCache.sequences;
      const layer = vectorTile.layers.sequence;

      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i).toGeoJSON(tile.xyz[0], tile.xyz[1], tile.xyz[2]);
        if (!feature) continue;
        const sequenceID = feature.properties.id;

        let lineStrings = cache.get(sequenceID);
        if (!lineStrings) {
          lineStrings = [];
          cache.set(sequenceID, lineStrings);
        }
        lineStrings.push(feature);
      }
    }

    if (vectorTile.layers.hasOwnProperty('point')) {
      const cache = this._mlyCache.points;
      const layer = vectorTile.layers.point;
      let boxes = [];

      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i).toGeoJSON(tile.xyz[0], tile.xyz[1], tile.xyz[2]);
        if (!feature) continue;

        const loc = feature.geometry.coordinates;
        const d = {
          type: 'detection',
          id: feature.properties.id,
          loc: loc,
          first_seen_at: feature.properties.first_seen_at,
          last_seen_at: feature.properties.last_seen_at,
          value: feature.properties.value
        };

        boxes.push({ minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1], data: d });
      }
      cache.rtree.load(boxes);
    }

    if (vectorTile.layers.hasOwnProperty('traffic_sign')) {
      const cache = this._mlyCache.signs;
      const layer = vectorTile.layers.traffic_sign;
      let boxes = [];

      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i).toGeoJSON(tile.xyz[0], tile.xyz[1], tile.xyz[2]);
        const loc = feature.geometry.coordinates;

        const d = {
          type: 'detection',
          id: feature.properties.id,
          loc: loc,
          first_seen_at: feature.properties.first_seen_at,
          last_seen_at: feature.properties.last_seen_at,
          value: feature.properties.value
        };
        boxes.push({ minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1], data: d });
      }
      cache.rtree.load(boxes);
    }
  }


  // Get data from the API
  _loadDataAsync(url) {
    return fetch(url)
      .then(utilFetchResponse)
      .then(result => {
        return result?.data || [];
      })
      .catch(err => {
        if (err.name === 'AbortError') return;          // ok
        if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
      });
  }


  /**
   * _loadAssetsAsync
   * Load the Mapillary JS and CSS files into the document head
   * @return {Promise} Promise resolved when both files have been loaded
   */
  _loadAssetsAsync() {
    if (this._loadPromise) return this._loadPromise;

    return this._loadPromise = new Promise((resolve, reject) => {
      const assets = this.context.systems.assets;

      let count = 0;
      const loaded = () => {
        if (++count === 2) resolve();
      };

      const $head = d3_select('head');

      $head.selectAll('#rapideditor-mapillary-css')
        .data([0])
        .enter()
        .append('link')
        .attr('id', 'rapideditor-mapillary-css')
        .attr('rel', 'stylesheet')
        .attr('crossorigin', 'anonymous')
        .attr('href', assets.getAssetURL('mapillary_css'))
        .on('load', loaded)
        .on('error', reject);

      $head.selectAll('#rapideditor-mapillary-js')
        .data([0])
        .enter()
        .append('script')
        .attr('id', 'rapideditor-mapillary-js')
        .attr('crossorigin', 'anonymous')
        .attr('src', assets.getAssetURL('mapillary_js'))
        .on('load', loaded)
        .on('error', reject);
    });
  }


  // Initialize image viewer (Mapillary JS)
  _initViewer() {
    const mapillary = window.mapillary;
    if (!mapillary) throw new Error('mapillary not loaded');
    if (!mapillary.isSupported()) throw new Error('mapillary not supported');

    const context = this.context;
    const map = context.systems.map;
    const photos = context.systems.photos;
    const ui = context.systems.ui;

    const opts = {
      accessToken: accessToken,
      component: {
        cover: false,
        bearing: { size: mapillary.ComponentSize.Standard },
        keyboard: false,
        tag: true
      },
      container: 'rapideditor-mly'
    };


    // imageChanged: called after the viewer has changed images and is ready.
    const imageChanged = (node) => {
      this.resetTags();
      const image = node.image;

      const loc = [image.originalLngLat.lng, image.originalLngLat.lat];
      map.centerEase(loc);
      photos.selectPhoto('mapillary', image.id);

      if (this._mlyShowFeatureDetections || this._mlyShowSignDetections) {
        this._updateDetections(image.id);
      }
      this.emit('imageChanged');
    };

    // bearingChanged: called when the bearing changes in the image viewer.
    const bearingChanged = (e) => {
      this.emit('bearingChanged', e);
    };

    const fovChanged = (e) => {
      this.emit('fovChanged', e);
    };

    this._viewer = new mapillary.Viewer(opts);
    this._viewer.on('image', imageChanged);
    this._viewer.on('bearing', bearingChanged);
    this._viewer.on('fov', fovChanged);

    if (this._viewerFilter) {
      this._viewer.setFilter(this._viewerFilter);
    }

    // Register viewer resize handler
    ui.photoviewer.on('resize.mapillary', () => {
      if (this._viewer) this._viewer.resize();
    });
  }

}
