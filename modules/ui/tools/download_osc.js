import { select as d3_select } from 'd3-selection';

import { JXON } from '../../util/jxon';
import { osmChangeset } from '../../osm';
import { actionDiscardTags } from '../../actions';
import { uiIcon } from '../icon';
import { uiTooltip } from '../tooltip';


export function uiToolDownloadOsc(context) {
  let tool = {
    id: 'download_osc',
    label: context.t('download_osc.title')
  };

  let button = d3_select(null);
  let tooltip = null;
  let _numChanges = 0;

  function isDisabled() {
    return _numChanges === 0;
  }

  function downloadOsc(d3_event) {
    d3_event.preventDefault();
    const editSystem = context.editSystem();
    if (!context.inIntro() && editSystem.hasChanges()) {
      const changes = editSystem.changes(actionDiscardTags(editSystem.difference()));
      const changeset = new osmChangeset();
      const osc = JXON.stringify(changeset.osmChangeJXON(changes));
      downloadFile(osc, 'change.osc');
    }
  }

  function updateCount() {
    const val = context.editSystem().difference().summary().size;
    if (val === _numChanges) return;   // no change
    _numChanges = val;

    button.classed('disabled', isDisabled());
    if (tooltip) {
      tooltip
        .title(context.t(_numChanges > 0 ? 'download_osc.help' : 'download_osc.no_changes'));
    }

  }

  function downloadFile(data, fileName) {
    let a = document.createElement('a');   // Create an invisible A element
    a.style.display = 'none';
    document.body.appendChild(a);

    // Set the HREF to a Blob representation of the data to be downloaded
    a.href = window.URL.createObjectURL(new Blob([data]));

    // Use download attribute to set set desired file name
    a.setAttribute('download', fileName);

    // Trigger the download by simulating click
    a.click();

    // Cleanup
    window.URL.revokeObjectURL(a.href);
    document.body.removeChild(a);
  }


  tool.install = function(selection) {
    tooltip = uiTooltip(context)
      .placement('bottom')
      .title(context.t('download_osc.no_changes'));

    button = selection
      .append('button')
      .attr('class', 'downloadOsc disabled bar-button')
      .on('click', downloadOsc)
      .call(tooltip);

    button
      .call(uiIcon('#rapid-icon-download-osc'));

    updateCount();


    context.editSystem()
      .on('change.download_osc', updateCount);

    context
      .on('enter.download_osc', () => {
        button.classed('disabled', isDisabled());
      });
  };


  tool.uninstall = function() {
    context.editSystem()
      .on('change.download_osc', null);

    context
      .on('enter.download_osc', null);

    button = d3_select(null);
    tooltip = null;
  };

  return tool;
}
