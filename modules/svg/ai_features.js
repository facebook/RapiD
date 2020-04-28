import _throttle from 'lodash-es/throttle';

import { select as d3_select} from 'd3-selection';
import { geoScaleToZoom } from '../geo';
import { services } from '../services';
import { svgPath, svgPointTransform } from './index';
import { utilStringQs } from '../util';


const radii = {
    //       z16-, z17,  z18+
    stroke: [3.5,  4,    4.5],
    fill:   [2,    2,    2.5]
};
let _enabled = false;
let _initialized = false;
let _FbMlService;
let _EsriService;
let _actioned;


export function svgAiFeatures(projection, context, dispatch) {
  const throttledRedraw = _throttle(() => dispatch.call('change'), 1000);
  const gpxInUrl = utilStringQs(window.location.hash).gpx;
  let _layer = d3_select(null);


  function init() {
    if (_initialized) return;  // run once

    _enabled = true;
    _initialized = true;
    _actioned = new Set();

    // Watch history to synchronize the displayed layer with features
    // that have been accepted or rejected by the user.
    context.history().on('undone.aifeatures', onHistoryUndone);
    context.history().on('change.aifeatures', onHistoryChange);
    context.history().on('restore.aifeatures', onHistoryRestore);
  }


  // Services are loosly coupled in iD, so we use these functions
  // to gain access to them, and bind the event handlers a single time.
  function getFbMlService() {
    if (services.fbMLRoads && !_FbMlService) {
      _FbMlService = services.fbMLRoads;
      _FbMlService.event.on('loadedData', throttledRedraw);
    }
    return _FbMlService;
  }

  function getEsriService() {
    if (services.esriData && !_EsriService) {
      _EsriService = services.esriData;
      _EsriService.event.on('loadedData', throttledRedraw);
    }
    return _EsriService;
  }


  function isAiFeaturesAnnotation(annotation) {
    return annotation &&
      (annotation.type === 'fb_accept_feature'
      || annotation.type === 'fb_reject_feature');
  }


  function onHistoryUndone(currentStack, previousStack) {
    const annotation = previousStack.annotation;
    if (isAiFeaturesAnnotation(annotation)) {
      _actioned.delete(annotation.id);
      if (_enabled) { dispatch.call('change'); }  // redraw
    }
  }


  function onHistoryChange(/* difference */) {
    const annotation = context.history().peekAnnotation();
    if (isAiFeaturesAnnotation(annotation)) {
      _actioned.add(annotation.id);
      if (_enabled) { dispatch.call('change'); }  // redraw
    }
  }


  function onHistoryRestore() {
    _actioned = new Set();
    context.history().peekAllAnnotations().forEach(annotation => {
      if (isAiFeaturesAnnotation(annotation)) {
        _actioned.add(annotation.id);
        // origid (the original entity ID), a.k.a. datum.__origid__,
        // is a hack used to deal with non-deterministic way-splitting
        // in the roads service. Each way "split" will have an origid
        // attribute for the original way it was derived from. In this
        // particular case, restoring from history on page reload, we
        // prevent new splits (possibly different from before the page
        // reload) from being displayed by storing the origid and
        // checking against it in render().
        if (annotation.origid) {
          _actioned.add(annotation.origid);
        }
      }
    });
    if (_actioned.size && _enabled) {
      dispatch.call('change');  // redraw
    }
  }


  function showLayer() {
    throttledRedraw();
    layerOn();
  }


  function hideLayer() {
    throttledRedraw.cancel();
    layerOff();
  }


  function layerOn() {
    _layer.style('display', 'block');
  }


  function layerOff() {
    _layer.style('display', 'none');
  }


  function isBuilding(d) {
    return d.tags.building === 'yes';
  }


  function isRoad(d) {
    return !!d.tags.highway;
  }


  function featureKey(d) {
    return d.__fbid__;
  }


  function featureClasses(d) {
    return [
      'data' + d.__fbid__,
      isBuilding(d) ? 'building' : 'road',
      d.geometry.type,
    ].filter(Boolean).join(' ');
  }


  function render(selection) {
    const rapidContext = context.rapidContext();

    // Ensure Rapid layer and <defs> exists
    _layer = selection.selectAll('.layer-ai-features')
      .data(_enabled ? [0] : []);

    _layer.exit()
      .remove();

    let layerEnter = _layer.enter()
      .append('g')
      .attr('class', 'layer-ai-features');

    layerEnter
      .append('defs')
      .attr('class', 'rapid-defs');

    _layer = layerEnter
      .merge(_layer);

    const surface = context.surface();
    const waitingForTaskExtent = gpxInUrl && !rapidContext.getTaskExtent();
    if (!surface || surface.empty() || waitingForTaskExtent) return;  // not ready to draw yet, starting up


    // Gather available datasets, generate a unique fill pattern
    // and a layer group for each dataset. Fill pattern styling is complicated.
    // Style needs to apply in the def, not where the pattern is used.
    const rapidDatasets = rapidContext.datasets();
    const datasets = Object.values(rapidDatasets)
      .filter(dataset => dataset.enabled);

    let defs = _layer.selectAll('.rapid-defs');
    let dsPatterns = defs.selectAll('.rapid-fill-pattern')
      .data(datasets, d => d.key);

    // exit
    dsPatterns.exit()
      .remove();

    // enter
    let dsPatternsEnter = dsPatterns.enter()
      .append('pattern')
      .attr('id', d => `fill-${d.key}`)
      .attr('class', 'rapid-fill-pattern')
      .attr('width', 4)
      .attr('height', 15)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('patternTransform', 'rotate(45 50 50)');

    dsPatternsEnter
      .append('line')
      .attr('class', 'ai-building-line')
      .attr('stroke', 'currentColor')
      .attr('stroke-width', '2px')
      .attr('y2', '15');

    // update
    dsPatterns = dsPatternsEnter
      .merge(dsPatterns)
      .style('color', d => d.color || '#ff26d4');


    let dsGroups = _layer.selectAll('.layer-rapid-dataset')
      .data(datasets, d => d.key);

    // exit
    dsGroups.exit()
      .remove();

    // enter/update
    dsGroups = dsGroups.enter()
      .append('g')
      .attr('class', d => `layer-rapid-dataset layer-rapid-dataset-${d.key}`)
      .merge(dsGroups)
      .style('color', d => d.color || '#ff26d4')
      .each(eachDataset);
  }


  function eachDataset(dataset, i, nodes) {
    const rapidContext = context.rapidContext();
    const selection = d3_select(nodes[i]);
    const service = dataset.service === 'fbml' ? getFbMlService(): getEsriService();
    const graph = service && service.graph();
    const getPath = svgPath(projection, graph);
    const getTransform = svgPointTransform(projection);

    // Gather data
    let geoData = [];
    if (service && context.map().zoom() >= context.minEditableZoom()) {
      service.loadTiles(projection, rapidContext.getTaskExtent());
      geoData = service
        .intersects(context.extent())
        .filter(d => {
          return d.type === 'way'
            && !_actioned.has(d.id)
            && !_actioned.has(d.__origid__);  // see onHistoryRestore()
        })
        .filter(getPath);

      // fb_ai service gives us roads and buildings together,
      // so filter further according to which dataset we're drawing
      if (dataset.key === 'fbRoads') {
        geoData = geoData.filter(isRoad);
      } else if (dataset.key === 'msBuildings') {
        geoData = geoData.filter(isBuilding);
      }
    }


    // Draw shadow, casing, stroke layers
    let linegroups = selection
      .selectAll('g.linegroup')
      .data(['shadow', 'casing', 'stroke']);

    linegroups = linegroups.enter()
      .append('g')
      .attr('class', d => `linegroup linegroup-${d}`)
      .merge(linegroups);

    // Draw paths
    let pathData = {
      shadow: geoData,
      casing: geoData,
      stroke: geoData
    };

    let paths = linegroups
      .selectAll('path')
      .data(d => pathData[d], featureKey);

    // exit
    paths.exit()
      .remove();

    // enter/update
    paths = paths.enter()
      .append('path')
      .attr('style', d => isBuilding(d) ? `fill: url(#fill-${dataset.key})` : null)
      .attr('class', (d, i, nodes) => {
        const currNode = nodes[i];
        const linegroup = currNode.parentNode.__data__;
        return 'pathdata line ' + linegroup + ' ' + featureClasses(d);
      })
      .merge(paths)
      .attr('d', getPath);


    // Draw first, last vertex layers
    let vertexgroups = selection
      .selectAll('g.vertexgroup')
      .data(['first', 'last']);

    vertexgroups = vertexgroups.enter()
      .append('g')
      .attr('class', d => `vertexgroup vertexgroup-${d}`)
      .merge(vertexgroups);

    // Draw vertices
    let vertexData = {
      first: geoData,
      last: geoData
    };

    let vertices = vertexgroups
      .selectAll('g.vertex')
      .data(d => vertexData[d], featureKey);

    // exit
    vertices.exit()
      .remove();

    // enter
    let enter = vertices.enter()
      .append('g')
      .attr('class', (d, i, nodes) => {
        const currNode = nodes[i];
        const vertexgroup = currNode.parentNode.__data__;
        return 'node vertex ' + vertexgroup + ' ' + featureClasses(d);
      });

    enter
      .append('circle')
      .attr('class', 'stroke');

    enter
      .append('circle')
      .attr('class', 'fill');

    // update
    const zoom = geoScaleToZoom(projection.scale());
    const radiusIdx = (zoom < 17 ? 0 : zoom < 18 ? 1 : 2);
    vertices = vertices
      .merge(enter)
      .attr('transform', (d, i, nodes) => {
        const currNode = nodes[i];
        const vertexgroup = currNode.parentNode.__data__;
        const nodeIdx = vertexgroup === 'first' ? 0 : d.nodes.length - 1;
        return getTransform(graph.entities[d.nodes[nodeIdx]]);
      })
      .call(selection => {
        ['stroke', 'fill'].forEach(klass => {
          selection.selectAll('.' + klass)
            .attr('r', radii[klass][radiusIdx]);
        });
      });
  }


  render.showAll = function() {
    return _enabled;
  };


  render.enabled = function(val) {
    if (!arguments.length) return _enabled;

    _enabled = val;
    if (_enabled) {
      showLayer();
    } else {
      hideLayer();
    }

    dispatch.call('change');
    return render;
  };


  init();
  return render;
}
