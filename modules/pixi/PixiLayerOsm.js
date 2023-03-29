import * as PIXI from 'pixi.js';
import geojsonRewind from '@mapbox/geojson-rewind';
import { vecAngle, vecLength, vecInterp } from '@rapid-sdk/math';

import { services } from '../services';
import { presetManager } from '../presets';

import { AbstractLayer } from './AbstractLayer';
import { PixiFeatureLine } from './PixiFeatureLine';
import { PixiFeaturePoint } from './PixiFeaturePoint';
import { PixiFeaturePolygon } from './PixiFeaturePolygon';
import { utilDisplayName, utilDisplayPOIName } from '../util';
import { styleMatch } from './styles';

const MINZOOM = 12;


/**
 * PixiLayerOsm
 * @class
 */
export class PixiLayerOsm extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);

    const basemapContainer = this.scene.groups.get('basemap');

    this._enabled = true;  // OSM layers should be enabled by default
    this._service = null;
    this._resolved = new Map();  // Map (entity.id -> GeoJSON feature)

    this.getService();

// experiment for benchmarking
//    this._alreadyDownloaded = false;
//    this._saveCannedData = false;

    const areas = new PIXI.Container();
    areas.name = `${this.layerID}-areas`;
    areas.sortableChildren = true;
    this.areaContainer = areas;

    const lines = new PIXI.Container();
    lines.name = `${this.layerID}-lines`;
    lines.sortableChildren = true;
    this.lineContainer = lines;

    basemapContainer.addChild(areas, lines);
  }


  /**
   * Services are loosely coupled, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    if (services.osm && !this._service) {
      this._service = services.osm;
    } else if (!services.osm && this._service) {
      this._service = null;
    }

    return this._service;
  }


  /**
   * supported
   * Whether the Layer's service exists
   */
  get supported() {
    return !!this.getService();
  }


// experiment for benchmarking
//  /**
//   * downloadFile
//   * experiment for benchmarking
//   * @param  data
//   * @param  fileName
//   */
//  _downloadFile(data, fileName) {
//    let a = document.createElement('a');   // Create an invisible A element
//    a.style.display = 'none';
//    document.body.appendChild(a);
//
//    // Set the HREF to a Blob representation of the data to be downloaded
//    a.href = window.URL.createObjectURL(new Blob([data]));
//
//    // Use download attribute to set set desired file name
//    a.setAttribute('download', fileName);
//
//    // Trigger the download by simulating click
//    a.click();
//
//    // Cleanup
//    window.URL.revokeObjectURL(a.href);
//    document.body.removeChild(a);
//  }


  /**
   * render
   * Render any data we have, and schedule fetching more of it to cover the view
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  render(frame, projection, zoom) {
    const service = this.getService();
    if (!this._enabled || !service || zoom < MINZOOM) return;

    const context = this.context;
    const graph = context.graph();
    const map = context.map();

    context.loadTiles(context.projection);  // Load tiles of OSM data to cover the view

    let entities = context.history().intersects(map.extent());             // Gather data in view
    entities = context.features().filter(entities, this.context.graph());  // Apply feature filters

    const data = {
      polygons: new Map(),
      lines: new Map(),
      points: new Map(),
      vertices: new Map(),
    };

    for (const entity of entities) {
      const geom = entity.geometry(graph);
      if (geom === 'point') {
        data.points.set(entity.id, entity);
      } else if (geom === 'vertex') {
        data.vertices.set(entity.id, entity);
      } else if (geom === 'line') {
        data.lines.set(entity.id, entity);
      } else if (geom === 'area') {
        data.polygons.set(entity.id, entity);
      }
    }

// experiment for benchmarking
//    // Instructions to save 'canned' entity data for use in the renderer test suite:
//    // Set a breakpoint at the next line, then modify `this._saveCannedData` to be 'true'
//    // continuing will fire off the download of the data into a file called 'canned_data.json'.
//    // move the data into the test/spec/renderer directory.
//    if (this._saveCannedData && !this._alreadyDownloaded) {
//      const map = context.map();
//      const [lng, lat] = map.center();
//
//      let viewData = {
//        'lng': lng,
//        'lat': lat,
//        'zoom': zoom,
//        'width': window.innerWidth,
//        'height': window.innerHeight,
//        'projection': projection,
//        'data': data,
//        'entities': context.graph().base.entities   // TODO convert from Map to Object if we are keeping this)
//      };
//
//      let cannedData = JSON.stringify(viewData);
//      this._downloadFile(cannedData,`${zoom}_${lat}_${lng}_canned_osm_data.json`);
//      this._alreadyDownloaded = true;
//    }

    this.renderPolygons(frame, projection, zoom, data);
    this.renderLines(frame, projection, zoom, data);
    this.renderPoints(frame, projection, zoom, data);

    // At this point, all the visible linear features have been accounted for,
    // and parent-child data links have been established.

    // Gather ids related for the selected/hovered/drawing features.
    const selectedIDs = this._classHasData.get('selected') ?? new Set();
    const hoveredIDs = this._classHasData.get('hovered') ?? new Set();
    const drawingIDs = this._classHasData.get('drawing') ?? new Set();
    const dataIDs = new Set([...selectedIDs, ...hoveredIDs, ...drawingIDs]);

    // Experiment: avoid showing child vertices/midpoints for too small parents
    for (const dataID of dataIDs) {
      const entity = context.hasEntity(dataID);
      if (entity?.type === 'node') continue;  // ways, relations only

      const renderedFeatureIDs = this._dataHasFeature.get(dataID);
      let tooSmall = false;
      for (const featureID of renderedFeatureIDs) {
        const geom = this.features.get(featureID)?.geometry;
        if (!geom || (geom.width < 25 && geom.height < 25)) {
          tooSmall = true;
          break;
        }
      }
      if (tooSmall) {
        dataIDs.delete(dataID);
      }
    }

    // Expand set to include parent ways for selected/hovered/drawing nodes too..
    const interestingIDs = new Set(dataIDs);
    for (const dataID of dataIDs) {
      const entity = context.hasEntity(dataID);
      if (entity?.type !== 'node') continue;   // nodes only
      for (const parent of graph.parentWays(entity)) {
        interestingIDs.add(parent.id);
      }
    }

    // Create collections of the sibling and descendant IDs,
    // These will determine which vertices and midpoints get drawn.
    const related = {
      descendantIDs: new Set(),
      siblingIDs: new Set()
    };
    for (const interestingID of interestingIDs) {
      this.getSelfAndDescendants(interestingID, related.descendantIDs);
      this.getSelfAndSiblings(interestingID, related.siblingIDs);
    }

    this.renderVertices(frame, projection, zoom, data, related);

    if (context.mode()?.id === 'select') {
      this.renderMidpoints(frame, projection, zoom, data, related);
    }
  }


  /**
   * renderPolygons
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  data         Visible OSM data to render, sorted by type
   */
  renderPolygons(frame, projection, zoom, data) {
    const entities = data.polygons;
    const graph = this.context.graph();
    const pointsContainer = this.scene.groups.get('points');
    const pointsHidden = this.context.features().hidden('points');

    for (const [entityID, entity] of entities) {
      const entityVersion = (entity.v || 0);

      // Cache GeoJSON resolution, as we expect the rewind and asGeoJSON calls to be kinda slow.
      let geojson = this._resolved.get(entityID);
      if (geojson?.v !== entityVersion) {  // bust cache if the entity has a new verison
        geojson = null;
      }
      if (!geojson) {
        geojson = geojsonRewind(entity.asGeoJSON(graph), true);
        geojson.v = entityVersion;
        this._resolved.set(entityID, geojson);
      }

      const parts = (geojson.type === 'Polygon') ? [geojson.coordinates]
        : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];

      for (let i = 0; i < parts.length; ++i) {
        const coords = parts[i];
        const featureID = `${this.layerID}-${entityID}-fill-${i}`;
        let feature = this.features.get(featureID);

        // If feature existed before as a different type, recreate it.
        if (feature && feature.type !== 'polygon') {
          feature.destroy();
          feature = null;
        }

        if (!feature) {
          feature = new PixiFeaturePolygon(this, featureID);
          feature.parentContainer = this.areaContainer;
        }

        // If data has changed.. Replace data and parent-child links.
        if (feature.v !== entityVersion) {
          feature.v = entityVersion;
          feature.geometry.setCoords(coords);
          const area = feature.geometry.origExtent.area();   // estimate area from extent for speed
          feature.container.zIndex = -area;      // sort by area descending (small things above big things)

          feature.setData(entityID, entity);
          feature.clearChildData(entityID);
          if (entity.type === 'relation') {
            entity.members.forEach(member => feature.addChildData(entityID, member.id));
          }
          if (entity.type === 'way') {
            entity.nodes.forEach(nodeID => feature.addChildData(entityID, nodeID));
          }
        }

        this.syncFeatureClasses(feature);

        if (feature.dirty) {
          const style = styleMatch(entity.tags);
          style.labelTint = style.fill.color ?? style.stroke.color ?? 0xeeeeee;
          feature.style = style;

          const label = utilDisplayPOIName(entity);
          feature.label = label;

          // POI = "Point of Interest" -and- "Pole of Inaccessability"
          // For POIs mapped as polygons, we can create a virtual point feature at the pole of inaccessability.
          let poiPreset;
          feature.geometry.update(projection);  // update now, so we have `origPoi` calculated
          if (label && feature.geometry.origPoi) {
            poiPreset = presetManager.matchTags(entity.tags, 'point', feature.geometry.origPoi);
          }

          if (!pointsHidden && poiPreset && !poiPreset.isFallback() && poiPreset.id !== 'address') {
            feature.poiFeatureID = `${this.layerID}-${entityID}-poi-${i}`;
            feature.poiPreset = poiPreset;
          } else {
            feature.poiFeatureID = null;
            feature.poiPreset = null;
          }
        }

        feature.update(projection, zoom);
        this.retainFeature(feature, frame);


        // Same as above, but for the virtual POI, if any
        if (feature.poiFeatureID) {
          let poiFeature = this.features.get(feature.poiFeatureID);

          if (!poiFeature) {
            poiFeature = new PixiFeaturePoint(this, feature.poiFeatureID);
            poiFeature.virtual = true;
            poiFeature.parentContainer = pointsContainer;
          }

          if (poiFeature.v !== entityVersion) {
            poiFeature.v = entityVersion;
            poiFeature.geometry.setCoords(feature.geometry.origPoi);
            poiFeature.setData(entityID, entity);
          }

          this.syncFeatureClasses(poiFeature);

          if (poiFeature.dirty) {
            let markerStyle = {
              markerName: 'pin',
              markerTint: 0xffffff,
              iconName: feature.poiPreset.icon,
              iconAlpha: 1
            };

            if (hasWikidata(entity)) {
              markerStyle.markerName = 'boldPin';
              markerStyle.markerTint = 0xdddddd;
              markerStyle.labelTint = 0xdddddd;
              markerStyle.iconAlpha = 0.6;
            }
            poiFeature.style = markerStyle;
            poiFeature.label = feature.label;
          }

          poiFeature.update(projection, zoom);
          this.retainFeature(poiFeature, frame);
        }

      }
    }
  }


  /**
   * renderLines
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  data         Visible OSM data to render, sorted by type
   */
  renderLines(frame, projection, zoom, data) {
    const entities = data.lines;
    const graph = this.context.graph();
    const lineContainer = this.lineContainer;

    for (const [entityID, entity] of entities) {
      const entityVersion = (entity.v || 0);
      const layer = (typeof entity.layer === 'function') ? entity.layer() : 0;
      const levelContainer = _getLevelContainer(layer.toString());
      const zindex = getzIndex(entity.tags);

      // Cache GeoJSON resolution, as we expect the asGeoJSON call to be kinda slow.
      let geojson = this._resolved.get(entityID);
      if (geojson?.v !== entityVersion) {  // bust cache if the entity has a new verison
        geojson = null;
      }
      if (!geojson) {
        geojson = entity.asGeoJSON(graph);
        geojson.v = entityVersion;
        if (geojson.type === 'LineString' && entity.tags.oneway === '-1') {
          geojson.coordinates.reverse();
        }
        this._resolved.set(entityID, geojson);
      }

      const parts = (geojson.type === 'LineString') ? [[geojson.coordinates]]
        : (geojson.type === 'Polygon') ? [geojson.coordinates]
        : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];

      for (let i = 0; i < parts.length; ++i) {
        const segments = parts[i];
        for (let j = 0; j < segments.length; ++j) {
          const coords = segments[j];
          const featureID = `${this.layerID}-${entityID}-${i}-${j}`;
          let feature = this.features.get(featureID);

          // If feature existed before as a different type, recreate it.
          if (feature && feature.type !== 'line') {
            feature.destroy();
            feature = null;
          }

          if (!feature) {
            feature = new PixiFeatureLine(this, featureID);
          }

          // If data has changed.. Replace data and parent-child links.
          if (feature.v !== entityVersion) {
            feature.v = entityVersion;
            feature.geometry.setCoords(coords);
            feature.parentContainer = levelContainer;    // Change layer stacking if necessary
            feature.container.zIndex = zindex;

            feature.setData(entityID, entity);
            feature.clearChildData(entityID);
            if (entity.type === 'relation') {
              entity.members.forEach(member => feature.addChildData(entityID, member.id));
            }
            if (entity.type === 'way') {
              entity.nodes.forEach(nodeID => feature.addChildData(entityID, nodeID));
            }
          }

          this.syncFeatureClasses(feature);

          if (feature.dirty) {
            let tags = entity.tags;
            let geom = entity.geometry(graph);

            // a line no tags - try to style match the tags of its parent relation
            if (!entity.hasInterestingTags()) {
              const parent = graph.parentRelations(entity).find(relation => relation.isMultipolygon());
              if (parent) {
                tags = parent.tags;
                geom = 'area';
              }
            }

            const style = styleMatch(tags);
            // Todo: handle alternating/two-way case too
            if (geom === 'line') {
              style.lineMarkerName = entity.isOneWay() ? 'oneway' : '';
              style.sidedMarkerName = entity.isSided() ? 'sided' : '';
            } else {  // an area
              style.casing.width = 0;
              style.stroke.color = style.fill.color;
              style.stroke.width = 2;
              style.stroke.alpha = 1;
            }
            feature.style = style;

            feature.label = utilDisplayName(entity);
          }

          feature.update(projection, zoom);
          this.retainFeature(feature, frame);
        }
      }
    }


    function _getLevelContainer(level) {
      let levelContainer = lineContainer.getChildByName(level);
      if (!levelContainer) {
        levelContainer = new PIXI.Container();
        levelContainer.name = level.toString();
        levelContainer.sortableChildren = true;
        levelContainer.zIndex = level;
        lineContainer.addChild(levelContainer);
      }
      return levelContainer;
    }

  }


  /**
   * renderVertices
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  data         Visible OSM data to render, sorted by type
   * @param  realated     Collections of related OSM IDs
   */
  renderVertices(frame, projection, zoom, data, related) {
    const entities = data.vertices;
    const context = this.context;
    const graph = context.graph();

    // Vertices related to the selection/hover should be drawn above everything
    const mapUIContainer = this.scene.layers.get('map-ui').container;
    const selectedContainer = mapUIContainer.getChildByName('selected');
    const pointsContainer = this.scene.groups.get('points');

    function isInterestingVertex(node) {
      return node.hasInterestingTags() || node.isEndpoint(graph) || node.isIntersection(graph);
    }

    function isRelatedVertex(entityID) {
      return related.descendantIDs.has(entityID) || related.siblingIDs.has(entityID);
    }


    for (const [nodeID, node] of entities) {
      let parentContainer = null;

      if (zoom >= 16 && isInterestingVertex(node) ) {  // minor importance
        parentContainer = pointsContainer;
      }
      if (isRelatedVertex(nodeID)) {   // major importance
        parentContainer = selectedContainer;
      }

      if (!parentContainer) continue;   // this vertex isn't important enough to render

      const featureID = `${this.layerID}-${nodeID}`;
      let feature = this.features.get(featureID);

      // If feature existed before as a different type, recreate it.
      if (feature && feature.type !== 'point') {
        feature.destroy();
        feature = null;
      }

      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID);
      }

      // If data has changed, replace it.
      const entityVersion = (node.v || 0);
      if (feature.v !== entityVersion) {
        feature.v = entityVersion;
        feature.geometry.setCoords(node.loc);
        feature.setData(nodeID, node);
      }

      this.syncFeatureClasses(feature);
      feature.parentContainer = parentContainer;   // change layer stacking if necessary

      if (feature.dirty) {
        const preset = presetManager.match(node, graph);
        const iconName = preset && preset.icon;
        const directions = node.directions(graph, context.projection);

        // set marker style
        let markerStyle = {
          markerName: 'smallCircle',
          markerTint: 0xffffff,
          labelTint: 0xeeeeee,
          viewfieldAngles: directions,
          viewfieldName: 'viewfieldDark',
          viewfieldTint: 0xffffff,
          iconName: iconName,
          iconAlpha: 1
        };

        if (iconName) {
          markerStyle.markerName = 'largeCircle';
          markerStyle.iconName = iconName;
        } else if (node.hasInterestingTags()) {
          markerStyle.markerName = 'taggedCircle';
        }

        if (hasWikidata(node)) {
          markerStyle.markerTint = 0xdddddd;
          markerStyle.labelTint = 0xdddddd;
          markerStyle.iconAlpha = 0.6;
        }
        if (graph.isShared(node)) {     // shared nodes / junctions are more grey
          markerStyle.markerTint = 0xbbbbbb;
          markerStyle.labelTint = 0xbbbbbb;
        }

        feature.style = markerStyle;
        feature.label = utilDisplayName(node);
      }

      feature.update(projection, zoom);
      this.retainFeature(feature, frame);
    }
  }


  /**
   * renderPoints
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  data         Visible OSM data to render, sorted by type
   */
  renderPoints(frame, projection, zoom, data) {
    const entities = data.points;
    const graph = this.context.graph();
    const pointsContainer = this.scene.groups.get('points');

    for (const [nodeID, node] of entities) {
      const entityVersion = (node.v || 0);
      const featureID = `${this.layerID}-${nodeID}`;
      let feature = this.features.get(featureID);

      // If feature existed before as a different type, recreate it.
      if (feature && feature.type !== 'point') {
        feature.destroy();
        feature = null;
      }

      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID);
        feature.parentContainer = pointsContainer;
      }

      // If data has changed, replace it.
      if (feature.v !== entityVersion) {
        feature.v = entityVersion;
        feature.geometry.setCoords(node.loc);
        feature.setData(nodeID, node);
      }

      this.syncFeatureClasses(feature);

      if (feature.dirty) {
        const preset = presetManager.match(node, graph);
        const iconName = preset && preset.icon;
        const directions = node.directions(graph, this.context.projection);

        // set marker style
        let markerStyle = {
          markerName: 'pin',
          markerTint: 0xffffff,
          viewfieldAngles: directions,
          viewfieldName: 'viewfieldDark',
          viewfieldTint: 0xffffff,
          iconName: iconName,
          iconAlpha: 1
        };

        if (hasWikidata(node)) {
          markerStyle.markerName = 'boldPin';
          markerStyle.markerTint = 0xdddddd;
          markerStyle.labelTint = 0xdddddd;
          markerStyle.iconAlpha = 0.6;
        }
        if (preset.id === 'address') {
          markerStyle.markerName = 'largeCircle';
          markerStyle.iconName = 'maki-circle-stroked';
        }

        feature.style = markerStyle;
        feature.label = utilDisplayName(node);
      }

      feature.update(projection, zoom);
      this.retainFeature(feature, frame);
    }
  }


  /**
   * renderMidpoints
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  data         Visible OSM data to render, sorted by type
   * @param  related      Collections of related OSM IDs
   */
  renderMidpoints(frame, projection, zoom, data, related) {
    const MIN_MIDPOINT_DIST = 40;   // distance in pixels
    const graph = this.context.graph();

    //Need to consider both lines and polygons for drawing our midpoints
    const entities = new Map([...data.lines, ...data.polygons]);

    // Midpoints should be drawn above everything
    const mapUIContainer = this.scene.layers.get('map-ui').container;
    const selectedContainer = mapUIContainer.getChildByName('selected');

    // Generate midpoints from all the highlighted ways
    let midpoints = new Map();
    const MIDPOINT_STYLE = { markerName: 'midpoint' };
    for (const [wayID, way] of entities) {
      // Include only ways that are selected, or descended from a relation that is selected
      if (!related.descendantIDs.has(wayID)) continue;

      // Include only actual ways that have child nodes
      const nodes = graph.childNodes(way);
      if (!nodes.length) continue;

      // Compute midpoints in projected coordinates
      let nodeData = nodes.map(node => {
        return {
          id: node.id,
          point: projection.project(node.loc)
        };
      });

      if (way.tags.oneway === '-1') {
        nodeData.reverse();
      }

      nodeData.slice(0, -1).forEach((_, i) => {
        const a = nodeData[i];
        const b = nodeData[i + 1];
        const midpointID = [a.id, b.id].sort().join('-');
        const dist = vecLength(a.point, b.point);
        if (dist < MIN_MIDPOINT_DIST) return;

        const pos = vecInterp(a.point, b.point, 0.5);
        const rot = vecAngle(a.point, b.point);
        const loc = projection.invert(pos);  // store as wgs84 lon/lat
        const midpoint = {
          type: 'midpoint',
          id: midpointID,
          a: a,
          b: b,
          way: way,
          loc: loc,
          rot: rot
        };

        if (!midpoints.has(midpointID)) {
          midpoints.set(midpointID, midpoint);
        }
      });
    }

    for (const [midpointID, midpoint] of midpoints) {
      const featureID = `${this.layerID}-${midpointID}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID);
        feature.style = MIDPOINT_STYLE;
        feature.parentContainer = selectedContainer;
      }

      // Something about the midpoint has changed
      // Here we use the midpoint location as it's "version"
      // (This can happen if a sibling node has moved, the midpoint moves too)
      if (feature.v !== midpoint.loc) {
        feature.v = midpoint.loc;
        feature.geometry.setCoords(midpoint.loc);
        feature.container.rotation = midpoint.rot;  // remember to apply rotation
        feature.setData(midpointID, midpoint);
        feature.addChildData(midpoint.way.id, midpointID);
      }

      this.syncFeatureClasses(feature);
      feature.update(projection, zoom);
      this.retainFeature(feature, frame);
    }
  }

}



const HIGHWAYSTACK = {
  motorway: 0,
  motorway_link: -1,
  trunk: -2,
  trunk_link: -3,
  primary: -4,
  primary_link: -5,
  secondary: -6,
  tertiary: -7,
  unclassified: -8,
  residential: -9,
  service: -10,
  track: -11,
  footway: -12
};


function getzIndex(tags) {
  return HIGHWAYSTACK[tags.highway] || 0;
}

// Special style for Wikidata-tagged items
function hasWikidata(entity) {
  return (
    entity.tags.wikidata ||
    entity.tags['flag:wikidata'] ||
    entity.tags['brand:wikidata'] ||
    entity.tags['network:wikidata'] ||
    entity.tags['operator:wikidata']
  );
}
