import { actionAddEntity } from '../actions/add_entity';
import { actionAddMidpoint } from '../actions/add_midpoint';
import { actionAddVertex } from '../actions/add_vertex';

// import { BehaviorAddWay } from '../behaviors/BehaviorAddWay';
import { modeDrawArea } from './draw_area';
import { osmNode, osmWay } from '../osm';


export function modeAddArea(context, mode) {
    mode.id = 'add-area';

    // var behavior = new BehaviorAddWay(context)
    var behavior = context.behaviors.get('add-way');
    behavior
      .on('start', start)
      .on('startFromWay', startFromWay)
      .on('startFromNode', startFromNode);


    var defaultTags = { area: 'yes' };
    if (mode.preset) defaultTags = mode.preset.setTags(defaultTags, 'area');


    function actionClose(wayId) {
        return function (graph) {
            return graph.replace(graph.entity(wayId).close());
        };
    }


    function start(loc) {
        var startGraph = context.graph();
        var node = osmNode({ loc: loc });
        var way = osmWay({ tags: defaultTags });

        context.perform(
            actionAddEntity(node),
            actionAddEntity(way),
            actionAddVertex(way.id, node.id),
            actionClose(way.id)
        );

        context.enter(modeDrawArea(context, way.id, startGraph, mode.button));
    }


    function startFromWay(loc, edge) {
        var startGraph = context.graph();
        var node = osmNode({ loc: loc });
        var way = osmWay({ tags: defaultTags });

        context.perform(
            actionAddEntity(node),
            actionAddEntity(way),
            actionAddVertex(way.id, node.id),
            actionClose(way.id),
            actionAddMidpoint({ loc: loc, edge: edge }, node)
        );

        context.enter(modeDrawArea(context, way.id, startGraph, mode.button));
    }


    function startFromNode(loc, node) {
        var startGraph = context.graph();
        var way = osmWay({ tags: defaultTags });

        context.perform(
            actionAddEntity(way),
            actionAddVertex(way.id, node.id),
            actionClose(way.id)
        );

        context.enter(modeDrawArea(context, way.id, startGraph, mode.button));
    }


    mode.enter = function() {
      context.enableBehaviors(['add-way', 'hover']);
      // context.install(behavior);
    };


    mode.exit = function() {
      // context.uninstall(behavior);
    };


    return mode;
}
