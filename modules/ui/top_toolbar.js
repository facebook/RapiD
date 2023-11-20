import { select as d3_select } from 'd3-selection';

import {
  uiToolRapidFeatures, uiToolDrawModes, uiToolNotes, uiToolSave,
  uiToolSidebarToggle, uiToolUndoRedo, uiToolDownloadOsc, uiToolFbBannerOne, uiToolFbBannerTwo
} from './tools';


export function uiTopToolbar(context) {
  const sidebarToggle = uiToolSidebarToggle(context);
  const rapidFeatures = uiToolRapidFeatures(context);
  const bannerOne = uiToolFbBannerOne(context);
  const bannerTwo = uiToolFbBannerTwo(context);
  const modes = uiToolDrawModes(context);
  const notes = uiToolNotes(context);
  const undoRedo = uiToolUndoRedo(context);
  const save = uiToolSave(context);
  const downloadOsc = uiToolDownloadOsc(context);


  function notesEnabled() {
    return context.scene().layers.get('notes')?.enabled;
  }


  function update(selection) {
    let tools = [sidebarToggle, 'spacer', bannerOne, modes, rapidFeatures, bannerTwo];

    if (notesEnabled()) {
      tools.push('spacer', notes);
    }

    tools.push('spacer', undoRedo, save);

    // Undocumented feature 'support_download_osc'
    const hash = context.systems.urlhash.initialHashParams;
    if (hash.get('support_download_osc') === 'true') {
      tools.push(downloadOsc);
    }

    let toolbarItems = selection.selectAll('.toolbar-item')
      .data(tools, d => d.id || d);

    // exit
    toolbarItems.exit()
      .each(d => {
        if (d.uninstall) d.uninstall();
      })
      .remove();

    // enter
    let itemsEnter = toolbarItems
      .enter()
      .append('div')
      .attr('class', d => {
        let classes = 'toolbar-item ' + (d.id || d).replace('_', '-');
        if (d.klass) classes += ' ' + d.klass;
        return classes;
      });

    let actionableEnter = itemsEnter
      .filter(d => d !== 'spacer');

    actionableEnter
      .append('div')
      .attr('class', 'item-content')
      .each((d, i, nodes) => {
        d3_select(nodes[i])
          .call(d.install, selection);
      });

    actionableEnter
      .append('div')
      .attr('class', 'item-label')
      .html(d => d.label);
  }


  function init(selection) {
    context.scene().on('layerchange', () => update(selection));
    update(selection);
  }

  return init;
}
