import { AbstractMode } from './AbstractMode';

import { actionAddEntity } from '../actions/add_entity';
import { actionAddMidpoint } from '../actions/add_midpoint';
import { actionAddVertex } from '../actions/add_vertex';
import { modeDrawArea } from './draw_area';
import { osmNode, osmWay } from '../osm';

const DEBUG = false;


/**
 * `ModeAddArea`
 * In this mode, we are waiting for the user to place the initial point of an area
 */
export class ModeAddArea extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);

    this.id = 'add-area';
    this.defaultTags = {};

    // Make sure the event handlers have `this` bound correctly
    this._start = this._start.bind(this);
    this._startFromWay = this._startFromWay.bind(this);
    this._startFromNode = this._startFromNode.bind(this);
    this._cancel = this._cancel.bind(this);
  }


  /**
   * enter
   */
  enter() {
    if (DEBUG) {
      console.log('ModeAddArea: entering');  // eslint-disable-line no-console
    }

    const context = this.context;
    this._active = true;
    this.defaultTags = { area: 'yes' };

    context.enableBehaviors(['hover', 'draw', 'map-interaction']);

    context.behaviors.get('draw')
      .on('click', this._start)
      .on('clickWay', this._startFromWay)
      .on('clickNode', this._startFromNode)
      .on('cancel', this._cancel)
      .on('finish', this._cancel);

    context.behaviors.get('map-interaction').doubleClickEnabled = false;

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;

    if (DEBUG) {
      console.log('ModeAddArea: exiting');  // eslint-disable-line no-console
    }

    const context = this.context;
    this._active = false;

    context.behaviors.get('draw')
      .off('click', this._start)
      .off('clickWay', this._startFromWay)
      .off('clickNode', this._startFromNode)
      .off('cancel', this._cancel)
      .off('finish', this._cancel);

    window.setTimeout(() => {
      context.behaviors.get('map-interaction').doubleClickEnabled = true;
    }, 1000);
  }


  /**
   * _actionClose
   * Helper function to force the given way to be closed (start and end at same node)
   */
  _actionClose(wayId) {
    return function (graph) {
      return graph.replace(graph.entity(wayId).close());
    };
  }


  /**
   * _start
   * Clicked on nothing, create the point at given `loc` and start area from there
   */
  _start(loc) {
    const context = this.context;
    const startGraph = context.graph();
    const node = osmNode({ loc: loc });
    const way = osmWay({ tags: this.defaultTags });

    context.perform(
      actionAddEntity(node),
      actionAddEntity(way),
      actionAddVertex(way.id, node.id),
      this._actionClose(way.id)
    );

    context.enter(modeDrawArea(context, way.id, startGraph, 'area'));
  }


  /**
   * _startFromWay
   * Clicked on an existing way, add a midpoint along the `edge` at given `loc` and start area from there
   */
  _startFromWay(loc, edge) {
    const context = this.context;
    const startGraph = context.graph();
    const node = osmNode({ loc: loc });
    const way = osmWay({ tags: this.defaultTags });

    context.perform(
      actionAddEntity(node),
      actionAddEntity(way),
      actionAddVertex(way.id, node.id),
      this._actionClose(way.id),
      actionAddMidpoint({ loc: loc, edge: edge }, node)
   );

    context.enter(modeDrawArea(context, way.id, startGraph, 'area'));
  }


  /**
   * _startFromNode
   * Clicked on an existing node, start new area from there.
   */
  _startFromNode(loc, node) {
    const context = this.context;
    const startGraph = context.graph();
    const way = osmWay({ tags: this.defaultTags });

    context.perform(
      actionAddEntity(way),
      actionAddVertex(way.id, node.id),
      this._actionClose(way.id)
    );

    context.enter(modeDrawArea(context, way.id, startGraph, 'area'));
  }


  /**
   * _cancel
   * Return to browse mode immediately, `exit()` will handle cleanup
   */
  _cancel() {
    this.context.enter('browse');
  }

}