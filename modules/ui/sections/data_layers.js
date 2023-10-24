import { select as d3_select } from 'd3-selection';

import { uiTooltip } from '../tooltip';
import { uiIcon } from '../icon';
import { uiCmd } from '../cmd';
import { uiSection } from '../section';
import { uiSettingsCustomData } from '../settings/custom_data';

// import color picker function
import { uiRapidColorpicker } from '../rapid_colorpicker';


export function uiSectionDataLayers(context) {
  const l10n = context.systems.l10n;
  const section = uiSection(context, 'data-layers')
    .label(l10n.tHtml('map_data.data_layers'))
    .disclosureContent(renderDisclosureContent);

  const settingsCustomData = uiSettingsCustomData(context)
    .on('change', customChanged);

  const scene = context.scene();

  // render color picker variable
  let _renderColorPicker;

  function renderDisclosureContent(selection) {
    let container = selection.selectAll('.data-layer-container')
      .data([0]);

    container.enter()
      .append('div')
      .attr('class', 'data-layer-container')
      .merge(container)
      .call(drawOsmItems)
      .call(drawQAItems)
      .call(drawCustomDataItems)
      .call(drawPanelItems);
  }


  function showsLayer(layerID) {
    const layer = scene.layers.get(layerID);
    return layer?.enabled;
  }


  function setLayer(layerID, val) {
    // Don't allow layer changes while drawing - iD#6584
    const mode = context.mode;
    if (mode && /^draw/.test(mode.id)) return;

    if (val) {
      scene.enableLayers(layerID);
    } else {
      scene.disableLayers(layerID);
      if (layerID === 'osm' || layerID === 'notes') {
        context.enter('browse');
      }
    }
  }


  function toggleLayer(layerID) {
    setLayer(layerID, !showsLayer(layerID));
  }


  function drawOsmItems(selection) {
    const osmKeys = ['osm', 'notes'];
    const osmLayers = osmKeys.map(layerID => scene.layers.get(layerID)).filter(Boolean);

    let ul = selection
      .selectAll('.layer-list-osm')
      .data([0]);

    ul = ul.enter()
      .append('ul')
      .attr('class', 'layer-list layer-list-osm')
      .merge(ul);

    let li = ul.selectAll('.list-item')
      .data(osmLayers);

    li.exit()
      .remove();

    let liEnter = li.enter()
      .append('li')
      .attr('class', d => `list-item list-item-${d.id}`);

    let labelEnter = liEnter
      .append('label')
      .each((d, i, nodes) => {
        if (d.id === 'osm') {
          d3_select(nodes[i])
            .call(uiTooltip(context)
              .title(l10n.tHtml(`map_data.layers.${d.id}.tooltip`))
              .keys([uiCmd('⌥' + l10n.t('area_fill.wireframe.key'))])
              .placement('bottom')
            );
        } else {
          d3_select(nodes[i])
            .call(uiTooltip(context)
              .title(l10n.tHtml(`map_data.layers.${d.id}.tooltip`))
              .placement('bottom')
            );
        }
      });

    labelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', (d3_event, d) => toggleLayer(d.id));

    labelEnter
      .append('span')
      .html(d => l10n.tHtml(`map_data.layers.${d.id}.title`));

    // Update
    li
      .merge(liEnter)
      .classed('active', d => d.enabled)
      .selectAll('input')
      .property('checked', d => d.enabled);
  }


  function drawQAItems(selection) {
    const qaKeys = ['keepRight', 'improveOSM', 'osmose'];
    const qaLayers = qaKeys.map(layerID => scene.layers.get(layerID)).filter(Boolean);

    let ul = selection
      .selectAll('.layer-list-qa')
      .data([0]);

    ul = ul.enter()
      .append('ul')
      .attr('class', 'layer-list layer-list-qa')
      .merge(ul);

    let li = ul.selectAll('.list-item')
      .data(qaLayers);

    li.exit()
      .remove();

    let liEnter = li.enter()
      .append('li')
      .attr('class', d => `list-item list-item-${d.id}`);

    let labelEnter = liEnter
      .append('label')
      .each((d, i, nodes) => {
        d3_select(nodes[i])
          .call(uiTooltip(context)
            .title(l10n.tHtml(`map_data.layers.${d.id}.tooltip`))
            .placement('bottom')
          );
      });

    labelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', (d3_event, d) => toggleLayer(d.id));

    labelEnter
      .append('span')
      .html(d => l10n.tHtml(`map_data.layers.${d.id}.title`));

    // Update
    li
      .merge(liEnter)
      .classed('active', d => d.enabled)
      .selectAll('input')
      .property('checked', d => d.enabled);
  }


  function drawCustomDataItems(selection) {
    const customLayer = scene.layers.get('custom-data');
    const isRTL = l10n.isRTL();

    let ul = selection
      .selectAll('.layer-list-data')
      .data(customLayer ? [customLayer] : []);

    // Exit
    ul.exit()
      .remove();

    // Enter
    let ulEnter = ul.enter()
      .append('ul')
      .attr('class', 'layer-list layer-list-data');

    let liEnter = ulEnter
      .append('li')
      .attr('class', 'list-item-data');

    let labelEnter = liEnter
      .append('label')
      .call(uiTooltip(context)
        .title(l10n.tHtml('map_data.layers.custom.tooltip'))
        .placement('top')
      );

    labelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', () => toggleLayer('custom-data'));

    labelEnter
      .append('span')
      .html(l10n.tHtml('map_data.layers.custom.title'));

      /////////// add color picker here //////////////
    const color = '#FF69B4';
    // eslint-disable-next-line no-warning-comments
    //TODO: connect selected color to changeColor function
    _renderColorPicker = uiRapidColorpicker(context, section)
      .on('change', changeCustomColor('custom-data', color));

  // eslint-disable-next-line no-warning-comments
    // FIXME: on click doesn't toggle color picker popup
    liEnter
      .append('button')
      .attr('class', 'rapid-colorpicker-fill')
      // need on click event handler to trigger colorpicker popup to render
      .call(uiIcon('#fas-palette'));

    liEnter
      .append('button')
      .attr('class', 'open-data-options')
      .call(uiTooltip(context)
        .title(l10n.tHtml('settings.custom_data.tooltip'))
        .placement(isRTL ? 'right' : 'left')
      )
      .on('click', d3_event => {
        d3_event.preventDefault();
        editCustom();
      })
      .call(uiIcon('#rapid-icon-more'));

    liEnter
      .append('button')
      .attr('class', 'zoom-to-data')
      .call(uiTooltip(context)
        .title(l10n.tHtml('map_data.layers.custom.zoom'))
        .placement(isRTL ? 'right' : 'left')
      )
      .on('click', function(d3_event) {
        if (d3_select(this).classed('disabled')) return;
        d3_event.preventDefault();
        d3_event.stopPropagation();
        const customLayer = scene.layers.get('custom-data');
        customLayer?.fitZoom();
      })
      .call(uiIcon('#rapid-icon-framed-dot', 'monochrome'));

    // Update
    ul = ul
      .merge(ulEnter);

    ul.selectAll('.list-item-data')
      .classed('active', d => d.enabled)
      .selectAll('label')
      .classed('deemphasize', d => !d.hasData)
      .selectAll('input')
      .property('disabled', d => !d.hasData)
      .property('checked', d => d.enabled);

    ul.selectAll('button.zoom-to-data')
      .classed('disabled', d => !d.hasData);

      // update colorpicker
    ul.selectAll('button.rapid-colorpicker-fill')
      .call(_renderColorPicker);
  }

  // color picker change color function

  function changeCustomColor(datasetID, color) {
    const rapid = context.systems.rapid;
    const dataset = rapid.datasets.get(datasetID);
    if (dataset) {
      dataset.color = color;

      context.scene().dirtyLayers('custom-data');
      context.systems.map.immediateRedraw();
   }
  }

  function editCustom() {
    context.container()
      .call(settingsCustomData);
  }


  function customChanged(d) {
    const customLayer = scene.layers.get('custom-data');
    if (!customLayer) return;

    if (d?.url) {
      customLayer.setUrl(d.url);
    } else if (d?.fileList) {
      customLayer.setFileList(d.fileList);
    }
  }


  function drawPanelItems(selection) {
    let panelsListEnter = selection.selectAll('.md-extras-list')
      .data([0])
      .enter()
      .append('ul')
      .attr('class', 'layer-list md-extras-list');

    let historyPanelLabelEnter = panelsListEnter
      .append('li')
      .attr('class', 'history-panel-toggle-item')
      .append('label')
      .call(uiTooltip(context)
        .title(l10n.tHtml('map_data.history_panel.tooltip'))
        .keys([uiCmd('⌘⇧' + l10n.t('info_panels.history.key'))])
        .placement('top')
      );

    historyPanelLabelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', d3_event => {
        d3_event.preventDefault();
        context.systems.ui.info.toggle('history');
      });

    historyPanelLabelEnter
      .append('span')
      .html(l10n.tHtml('map_data.history_panel.title'));

    let measurementPanelLabelEnter = panelsListEnter
      .append('li')
      .attr('class', 'measurement-panel-toggle-item')
      .append('label')
      .call(uiTooltip(context)
        .title(l10n.tHtml('map_data.measurement_panel.tooltip'))
        .keys([uiCmd('⌘⇧' + l10n.t('info_panels.measurement.key'))])
        .placement('top')
      );

    measurementPanelLabelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', d3_event => {
        d3_event.preventDefault();
        context.systems.ui.info.toggle('measurement');
      });

    measurementPanelLabelEnter
      .append('span')
      .html(l10n.tHtml('map_data.measurement_panel.title'));
  }


  context.scene().on('layerchange', section.reRender);

  return section;
}