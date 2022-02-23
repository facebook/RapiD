import * as PIXI from 'pixi.js';

import { services } from '../services';
import { PixiLayer } from './PixiLayer';

import { PixiOsmAreas } from './PixiOsmAreas';
import { PixiOsmLines } from './PixiOsmLines';
// import { PixiOsmMidpoints } from './PixiOsmMidpoints';
import { PixiOsmPoints } from './PixiOsmPoints';
import { PixiOsmVertices } from './PixiOsmVertices';
import { PixiLabels } from './PixiLabels';


const LAYERID = 'osm';
const LAYERZINDEX = 1;
const MINZOOM = 12;


/**
 * PixiOsm
 * @class
 */
export class PixiOsm extends PixiLayer {

  /**
   * @constructor
   * @param context
   * @param featureCache
   * @param dispatch
   */
  constructor(context, featureCache, dispatch) {
    super(context, LAYERID, LAYERZINDEX);

    this._enabled = true;  // OSM layers should be enabled by default

    this.featureCache = featureCache;
    this.dispatch = dispatch;

    this._service = null;
    this.getService();

    // Setup Scene
    //
    // A few definitions:
    //
    // - `buttonMode = true`    this displayObject will turn the cursor to a pointer when hovering over
    // - `buttonMode = false`   this displayObject will NOT turn the cursor to a pointer when hovering over (default)
    //
    // - `interactive = true`   this displayObject can emit events
    // - `interactive = false`  this displayObject can NOT emit events (default)
    //
    // - `interactiveChildren = true`   this container and its children will be checked for hits (default)
    // - `interactiveChildren = false`  this container and its children will NOT be checked for hits
    //
    // - `sortableChildren = true`   we will set a zIndex property on children and they will be sorted according to it
    // - `sortableChildren = false`  children will be drawn in the ordrer they are added to `children` array (default)
    //

    const areas = new PIXI.Container();
    areas.name = 'areas';
    areas.interactive = false;
    areas.sortableChildren = true;

    const lines = new PIXI.Container();
    lines.name = 'lines';
    lines.interactive = false;
    lines.sortableChildren = true;

    const vertices = new PIXI.Container();
    vertices.name = 'vertices';
    vertices.interactive = false;
    vertices.sortableChildren = true;

    const points = new PIXI.Container();
    points.name = 'points';
    points.interactive = false;
    points.sortableChildren = true;

    // const midpoints = new PIXI.Container();
    // midpoints.name = 'midpoints';
    // midpoints.interactive = false;
    // midpoints.sortableChildren = true;

    const labels = new PIXI.Container();
    labels.name = 'labels';
    labels.interactive = false;
    labels.interactiveChildren = false;
    labels.sortableChildren = false;

    this.container.addChild(areas, lines, vertices, points, labels);

    this.drawPoints = PixiOsmPoints(context, featureCache);
    this.drawVertices = PixiOsmVertices(context, featureCache);
    this.drawLines = PixiOsmLines(context, featureCache);
    this.drawAreas = PixiOsmAreas(context, featureCache);
    // this.drawMidpoints = PixiOsmMidpoints(context, featureCache);
    this.drawLabels = PixiLabels(context, featureCache);
  }


  /**
   * Services are loosely coupled in iD, so we use a `getService` function
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
   * render
   * Draw any data we have, and schedule fetching more of it to cover the view
   * @param projection - a pixi projection
   * @param zoom - the effective zoom to use for rendering
   */
  render(projection, zoom) {
    if (!this._enabled) return;

    const context = this.context;
    const map = context.map();
    const service = this.getService();

    if (service && zoom >= MINZOOM) {
      this.visible = true;

      // GATHER phase
      const data = context.history().intersects(map.extent());

      // CULL phase (currently osm only)
      // for now non-OSM features will have to cull themselves
      let visibleOSM = {};
      data.forEach(entity => visibleOSM[entity.id] = true);
      [...this.featureCache.entries()].forEach(function cull([id, feature]) {
        let isVisible = !!visibleOSM[id] || !context.graph().hasEntity(id);

        feature.displayObject.visible = isVisible;
        if (feature.label) {
          feature.label.displayObject.visible = isVisible;
        }
      });

      // DRAW phase
      const areasLayer = this.container.getChildByName('areas');
      const linesLayer = this.container.getChildByName('lines');
      const verticesLayer = this.container.getChildByName('vertices');
      const pointsLayer = this.container.getChildByName('points');
      // const midpointsLayer = this.container.getChildByName('midpoints');
      const labelsLayer = this.container.getChildByName('labels');

      this.drawAreas(areasLayer, projection, data);
      this.drawLines(linesLayer, projection, data);
      this.drawVertices(verticesLayer, projection, data);
      this.drawPoints(pointsLayer, projection, data);
      // this.drawMidpoints(midpointsLayer, projection, data);
      this.drawLabels(labelsLayer, projection, data);

    } else {
      this.visible = false;
    }
  }


  /**
   * supported
   * Whether the layer's service exists
   */
  get supported() {
    return !!this.getService();
  }

}

