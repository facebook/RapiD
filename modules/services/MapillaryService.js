import { select as d3_select } from 'd3-selection';
import { Tiler, geoSphericalDistance, vecSubtract } from '@rapid-sdk/math';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import RBush from 'rbush';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { utilFetchResponse } from '../util/index.js';

const accessToken = 'MLY|3376030635833192|f13ab0bdf6b2f7b99e0d8bd5868e1d88';
const apiUrl = 'https://graph.mapillary.com/';
const baseTileUrl = 'https://tiles.mapillary.com/maps/vtp';
const imageTileUrl = `${baseTileUrl}/mly1_public/2/{z}/{x}/{y}?access_token=${accessToken}`;
const detectionTileUrl = `${baseTileUrl}/mly_map_feature_point/2/{z}/{x}/{y}?access_token=${accessToken}`;
const trafficSignTileUrl = `${baseTileUrl}/mly_map_feature_traffic_sign/2/{z}/{x}/{y}?access_token=${accessToken}`;

const TILEZOOM = 14;


/**
 * `MapillaryService`
 *
 * Events available:
 *   `imageChanged`   - fired when a new image is visible in the viewer
 *   `bearingChanged` - fired when the viewer has been panned, receives the bearing value in degrees.
 *   `fovChanged`     - fired when the viewer has been zoomed, receives the fov value in degrees.
 *   `loadedImages`
 *   `loadedSigns`
 *   `loadedDetections`
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
    this._cache = {};

    this._viewer = null;
    this._viewerFilter = ['all'];
    this._keydown = this._keydown.bind(this);
    this._tiler = new Tiler().zoomRange(TILEZOOM).skipNullIsland(true);

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
    // Ignore keypresses unless we actually have a Mapillary photo showing
    const photos = this.context.systems.photos;
    if (!this.viewerShowing || photos.currPhotoLayerID !== 'mapillary') return;

    // Only allow key navigation if the user doesn't have something
    // more important focused - like a input, textarea, menu, etc.
    // and only allow key nav if we're showing the viewer and have the body or the map clicked
    const activeElement = document.activeElement?.tagName ?? 'BODY';
    const mapillaryViewerClass = document.activeElement?.className.startsWith('mapillary');
    if (activeElement !== 'BODY' && !mapillaryViewerClass) return;

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
    if (this._cache?.inflight) {
      for (const req of this._cache.inflight.values()) {
        req.controller.abort();
      }
    }

    this._cache = {
      images:       { lastv: null, data: new Map(), rbush: new RBush() },
      signs:        { lastv: null, data: new Map(), rbush: new RBush() },
      detections:   { lastv: null, data: new Map(), rbush: new RBush() },
      sequences:    { data: new Map() } ,      // Map<sequenceID, Array of LineStrings>
      image_detections: { forImageID: {} },
      inflight: new Map(),  // Map<url, {tileID, promise, controller}>
      loaded:   new Set()   // Set<url>
    };

    return Promise.resolve();
  }


  /**
   * getImage
   * Return an image from the cache.
   * @param   {string}  imageID - imageID to get
   * @return  {Object?} The image, or `undefined` if not found
   */
  getImage(imageID) {
    return this._cache.images.data.get(imageID);
  }


  /**
   * getSequence
   * Return a sequence from the cache.
   * @param   {string}  sequenceID - sequenceID to get
   * @return  {Object?} The sequence, or `undefined` if not found
   */
  getSequence(sequenceID) {
    return this._cache.sequences.data.get(sequenceID);
  }


  /**
   * getDetection
   * Return a detection from the cache.
   * @param   {string}  detectionID - detectionID to get
   * @return  {Object?} The detection, or `undefined` if not found
   */
  getDetection(detectionID) {
    // Check both 'detections' and 'signs' caches
    let detection = this._cache.detections.data.get(detectionID);
    if (detection) return detection;
    return this._cache.signs.data.get(detectionID);
  }


  /**
   * getData
   * Get already loaded data that appears in the current map view
   * @param   {string}  datasetID - one of 'images', 'signs', or 'detections'
   * @return  {Array}
   */
  getData(datasetID) {
    if (!['images', 'signs', 'detections'].includes(datasetID)) return [];

    const extent = this.context.viewport.visibleExtent();
    const cache = this._cache[datasetID];
    return cache.rbush.search(extent.bbox()).map(d => d.data);
  }


  /**
   * getSequences
   * Get already loaded sequence data that appears in the current map view
   * @return  {Array<FeatureCollection>}
   */
  getSequences() {
    const extent = this.context.viewport.visibleExtent();
    let result = new Map();  // Map(sequenceID -> Array of LineStrings)

    for (const box of this._cache.images.rbush.search(extent.bbox())) {
      const sequenceID = box.data.sequenceID;
      if (!sequenceID) continue;  // no sequence for this image
      const sequence = this._cache.sequences.data.get(sequenceID);
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
   * @param   {string}  datasetID - one of 'images', 'signs', or 'detections'
   */
  loadTiles(datasetID) {
    if (!['images', 'signs', 'detections'].includes(datasetID)) return;

    // exit early if the view is unchanged since the last time we loaded tiles
    const viewport = this.context.viewport;
    if (this._cache[datasetID].lastv === viewport.v) return;
    this._cache[datasetID].lastv = viewport.v;

    // Determine the tiles needed to cover the view..
    const tiles = this._tiler.getTiles(viewport).tiles;

    // Abort inflight requests that are no longer needed..
    for (const req of this._cache.inflight.values()) {
      if (!req.tileID) continue;
      const needed = tiles.find(tile => tile.id === req.tileID);
      if (!needed) {
        req.controller.abort();
      }
    }

    for (const tile of tiles) {
      this._loadTileAsync(datasetID, tile);
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
   * shouldShowDetections
   * Determine whether detections should be shown in the mapillary viewer.
   * @return {Boolean}  `true` if they should be shown, `false` if not
   */
  shouldShowDetections() {
    const scene = this.context.scene();

    // are either of these layers enabled?
    const layerIDs = ['mapillary-detections', 'mapillary-signs'];
    return layerIDs.some(layerID => {
      const layer = scene.layers.get(layerID);
      return layer && layer.enabled;
    });
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


  /**
   * selectImageAsync
   * Note:  most code should call `PhotoSystem.selectPhoto(layerID, photoID)` instead.
   * That will manage the state of what the user clicked on, and then call this function.
   * @param  {string} imageID - the id of the image to select
   * @return {Promise} Promise that resolves to the image after it has been selected
   */
  selectImageAsync(imageID) {
    if (!imageID) return Promise.resolve();  // do nothing

    return this.startAsync()
      .then(() => this._viewer.moveTo(imageID))
      .then(mlyImage => {
        const cache = this._cache.images;

        return this._cacheImage(cache, {
          id:          mlyImage.id.toString(),
          loc:        [mlyImage.originalLngLat.lng, mlyImage.originalLngLat.lat],
          sequenceID:  mlyImage.sequenceId.toString(),
          captured_at: mlyImage.capturedAt,
          captured_by: mlyImage.creatorUsername,
          ca:          mlyImage.originalCompassAngle
        });
      })
      .catch(err => console.error('mly3', err));   // eslint-disable-line no-console
  }


  /**
   * selectDetectionAsync
   * Note:  most code should call `PhotoSystem.selectDetection(layerID, photoID)` instead.
   * That will manage the state of what the user clicked on, and then call this function.
   * @param  {string} detectionID - the id of the detection to select
   * @return {Promise} Promise that resolves to the detection after it has been selected
   */
  selectDetectionAsync(detectionID) {
    if (!detectionID) return Promise.resolve();  // do nothing

    return this.startAsync()
      .then(() => this._loadDetectionAsync(detectionID));
  }


  // Get detections for the current image and shows them in the image viewer
  _updateDetections(imageID) {
    if (!this._viewer) return;
    if (!imageID) return;

    const url = `${apiUrl}/${imageID}/detections?access_token=${accessToken}&fields=id,image,geometry,value`;
    const cache = this._cache.image_detections;
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

    const context = this.context;
    const photos = context.systems.photos;
    const currDetectionID = photos.currDetectionID;

    if (currDetectionID === data.id) {
      color = 0xffff00;
      text = valueParts[1];
      if (text === 'flat' || text === 'discrete' || text === 'sign') {
        text = valueParts[2];
      }
      text = text.replace(/-/g, ' ');
      text = text.charAt(0).toUpperCase() + text.slice(1);
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


  /**
   * _loadTileAsync
   * Load a vector tile of data for the given dataset.
   * This uses `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=XXX`
   * @see    https://www.mapillary.com/developer/api-documentation#vector-tiles
   * @param  {string} datasetID - one of 'images', 'signs', or 'detections'
   * @param  {Tile}   tile - a tile object
   * @return {Promise}  Promise settled when the request is completed
   */
  _loadTileAsync(datasetID, tile) {
    if (!['images', 'signs', 'detections'].includes(datasetID)) {
      return Promise.resolve();  // nothing to do
    }

    let url = {
      images: imageTileUrl,
      signs: trafficSignTileUrl,
      detections: detectionTileUrl
    }[datasetID];

    url = url
      .replace('{x}', tile.xyz[0])
      .replace('{y}', tile.xyz[1])
      .replace('{z}', tile.xyz[2]);

    const cache = this._cache;

    if (cache.loaded.has(url)) {
      return Promise.resolve();  // already done
    }

    let req = cache.inflight.get(url);
    if (req) {
      return req.promise;
    } else {
      req = {
        tileID: tile.id,
        controller: new AbortController()
      };
    }

    const prom = fetch(url, { signal: req.controller.signal })
      .then(utilFetchResponse)
      .then(buffer => {
        cache.loaded.add(url);
        if (!buffer) {
          throw new Error('No Data');
        }

        this._processTile(buffer, tile);

        this.context.deferredRedraw();
        if (datasetID === 'images') {
          this.emit('loadedImages');
        } else if (datasetID === 'signs') {
          this.emit('loadedSigns');
        } else if (datasetID === 'detections') {
          this.emit('loadedDetections');
        }
      })
      .catch(err => {
        if (err.name === 'AbortError') return;          // ok
        if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
        cache.loaded.add(url);  // don't retry
      })
      .finally(() => {
        cache.inflight.delete(url);
      });

    req.promise = prom;
    cache.inflight.set(url, req);
    return prom;
  }


  /**
   * _processTile
   * Process vector tile data
   * @see    https://www.mapillary.com/developer/api-documentation#vector-tiles
   * @param  {ArrayBuffer}  buffer
   * @param  {Tile}         tile - a tile object
   */
  _processTile(buffer, tile) {
    const vectorTile = new VectorTile(new Protobuf(buffer));

    if (vectorTile.layers.hasOwnProperty('image')) {
      const cache = this._cache.images;
      const layer = vectorTile.layers.image;

      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i).toGeoJSON(tile.xyz[0], tile.xyz[1], tile.xyz[2]);
        if (!feature) continue;

        this._cacheImage(cache, {
          id:          feature.properties.id.toString(),
          loc:         feature.geometry.coordinates,
          sequenceID:  feature.properties.sequence_id.toString(),
          captured_at: feature.properties.captured_at,
          ca:          feature.properties.compass_angle,
          isPano:      feature.properties.is_pano,
        });
      }
    }

    if (vectorTile.layers.hasOwnProperty('sequence')) {
      const cache = this._cache.sequences;
      const layer = vectorTile.layers.sequence;

      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i).toGeoJSON(tile.xyz[0], tile.xyz[1], tile.xyz[2]);
        if (!feature) continue;

        const sequenceID = feature.properties.id.toString();
        let sequence = cache.data.get(sequenceID);
        if (!sequence) {
          sequence = {
            type: 'FeatureCollection',
            service: 'mapillary',
            id: sequenceID,     // not strictly spec, but should be
            v: 0,
            features: []
          };
          cache.data.set(sequenceID, sequence);
        }
        sequence.features.push(feature);
        sequence.v++;
      }
    }

    // 'point' and 'traffic_sign' are both detection layers.
    // We treat them the same, but their data gets stored in different caches.
    // (This allows the user to toggle them on/off independently of each other)
    for (const type of ['point', 'traffic_sign']) {
      if (!vectorTile.layers.hasOwnProperty(type)) continue;

      const cache = (type === 'traffic_sign') ? this._cache.signs : this._cache.detections;
      const layer = vectorTile.layers[type];

      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i).toGeoJSON(tile.xyz[0], tile.xyz[1], tile.xyz[2]);
        if (!feature) continue;

        // Note that the tile API _does not_ give us `images` or `aligned_direction`
        this._cacheDetection(cache, {
          id:            feature.properties.id.toString(),
          loc:           feature.geometry.coordinates,
          first_seen_at: feature.properties.first_seen_at,
          last_seen_at:  feature.properties.last_seen_at,
          value:         feature.properties.value,
          object_type:   type
        });
      }
    }
  }


  /**
   * _loadDetectionAsync
   * Get the details for a given detected feature (object or sign)
   * This uses `https://graph.mapillary.com/<map_feature_id>`
   * This API call gives us 2 things the tile API does not: `images` and `aligned_direction`
   * @see    https://www.mapillary.com/developer/api-documentation#map-feature
   * @param  {string}   detectionID - the detection to load
   * @return {Promise}  Promise settled when the detection details when completed
   */
  _loadDetectionAsync(detectionID) {
    // Is data is cached already and includes the `images` Array?  If so, resolve immediately.
    let detection = this._cache.detections.data.get(detectionID);
    if (detection?.imageIDs) {
      return Promise.resolve(detection);
    }
    detection = this._cache.signs.data.get(detectionID);
    if (detection?.imageIDs) {
      return Promise.resolve(detection);
    }

    // Not cached, load it..
    const fields = 'id,geometry,aligned_direction,first_seen_at,last_seen_at,object_value,object_type,images';
    const url = `${apiUrl}/${detectionID}?access_token=${accessToken}&fields=${fields}`;

    return fetch(url)
      .then(utilFetchResponse)
      .then(response => {
        if (!response) {
          throw new Error('No Data');
        }

        const type = response.object_type;  // Seems to be 'mvd_fast' or 'trafficsign' ??
        const cache = (type === 'trafficsign') ? this._cache.signs : this._cache.detections;

        // Gather imageIDs and try to choose the nearest one as the best.
        const loc = response.geometry.coordinates;
        const imageIDs = [];
        let minDist = Infinity;
        let bestImageID = null;

        for (const image of response.images?.data ?? []) {
          imageIDs.push(image.id);
          const dist = geoSphericalDistance(loc, image.geometry.coordinates);
          if (dist < minDist) {
            minDist = dist;
            bestImageID = image.id;
          }
        }

        // Note that the graph API _does_ give us `images` and `aligned_direction`
        const detection = this._cacheDetection(cache, {
          id:                 response.id.toString(),
          loc:                loc,
          first_seen_at:      response.first_seen_at,
          last_seen_at:       response.last_seen_at,
          value:              response.object_value,
          aligned_direction:  response.aligned_direcction,
          imageIDs:           imageIDs,
          bestImageID:        bestImageID,
          object_type:        (response.object_type === 'trafficsign') ? 'traffic_sign' : 'point'
        });

        this.context.immediateRedraw();
        return detection;
      })
      .catch(err => {
        if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
      });
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
      photos.selectPhoto('mapillary', image.id);

      if (this.shouldShowDetections()) {
        this._updateDetections(image.id);
      }
      this.emit('imageChanged');
    };

    const bearingChanged = (e) => {
      this.emit('bearingChanged', e.bearing);
    };

    const fovChanged = () => {
      this._viewer.getFieldOfView().then(fov => {
        this.emit('fovChanged', fov);
      });
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


  /**
   * _cacheImage
   * Store the given image in the caches
   * @param  {Object}  cache - the cache to use
   * @param  {Object}  props - the image properties
   * @return {Object}  The image
   */
  _cacheImage(cache, props) {
    let image = cache.data.get(props.id);
    if (!image) {
      image = {
        type:    'photo',
        service: 'mapillary',
        id:      props.id,
        loc:     props.loc
      };

      cache.data.set(image.id, image);

      const [x, y] = props.loc;
      cache.rbush.insert({ minX: x, minY: y, maxX: x, maxY: y, data: image });
    }

    // Update whatever additional props we were passed..
    if (props.sequenceID)   image.sequenceID  = props.sequenceID;
    if (props.captured_at)  image.captured_at = props.captured_at;
    if (props.captured_by)  image.captured_by = props.captured_by;
    if (props.ca)           image.ca          = props.ca;
    if (props.isPano)       image.isPano      = props.isPano;

    return image;
  }


  /**
   * _cacheDetection
   * Store the given detection in the caches
   * @param  {Object}  cache - the cache to use
   * @param  {Object}  props - the detection properties
   * @return {Object}  The detection
   */
  _cacheDetection(cache, props) {
    let detection = cache.data.get(props.id);
    if (!detection) {
      const loc = this._preventCoincident(cache.rbush, props.loc);
      detection = {
        type:        'detection',
        service:     'mapillary',
        id:          props.id,
        object_type: props.object_type,   // 'point' or 'traffic_sign'
        loc:         loc
      };

      cache.data.set(detection.id, detection);

      const [x, y] = loc;
      cache.rbush.insert({ minX: x, minY: y, maxX: x, maxY: y, data: detection });
    }

    // Update whatever additional props we were passed..
    if (props.first_seen_at)      detection.first_seen_at      = props.first_seen_at;
    if (props.last_seen_at)       detection.last_seen_at       = props.last_seen_at;
    if (props.value)              detection.value              = props.value;
    if (props.aligned_direction)  detection.aligned_direction  = props.aligned_direction;
    if (props.imageIDs)           detection.imageIDs           = props.imageIDs;
    if (props.bestImageID)        detection.bestImageID        = props.bestImageID;

    return detection;
  }


  /**
   * _preventCoincident
   * This checks if the cache already has something at that location, and if so, moves down slightly.
   * @param   {RBush}          rbush - the spatial cache to check
   * @param   {Array<number>}  loc   - original [longitude,latitude] coordinate
   * @return  {Array<number>}  Adjusted [longitude,latitude] coordinate
   */
  _preventCoincident(rbush, loc) {
    for (let dy = 0; ; dy++) {
      loc = vecSubtract(loc, [0, dy * 0.00001]);
      const box = { minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1] };
      if (!rbush.collides(box)) {
        return loc;
      }
    }
  }

}
