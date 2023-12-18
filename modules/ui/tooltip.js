import { utilFunctor } from '../util/util';
import { uiPopover } from './popover';
import { uiCmd } from './cmd';

export function uiTooltip(context) {
    const l10n = context.systems.l10n;
    var tooltip = uiPopover(context, 'tooltip').displayType('hover');

    var _title = function() {
        var title = this.getAttribute('data-original-title');
        if (title) {
            return title;
        } else {
            title = this.getAttribute('title');
            this.removeAttribute('title');
            this.setAttribute('data-original-title', title);
        }
        return title;
    };

    var _heading = utilFunctor(null);
    var _keys = utilFunctor(null);

    tooltip.title = function(val) {
        if (!arguments.length) return _title;
        _title = utilFunctor(val);
        return tooltip;
    };

    tooltip.heading = function(val) {
        if (!arguments.length) return _heading;
        _heading = utilFunctor(val);
        return tooltip;
    };

    tooltip.keys = function(val) {
        if (!arguments.length) return _keys;
        _keys = utilFunctor(val);
        return tooltip;
    };

    tooltip.content(function() {
        var heading = _heading.apply(this, arguments);
        var text = _title.apply(this, arguments);
        var keys = _keys.apply(this, arguments);

        return function(selection) {
            var headingSelect = selection
                .selectAll('.tooltip-heading')
                .data(heading ? [heading] :[]);

            headingSelect.exit()
                .remove();

            headingSelect.enter()
                .append('div')
                .attr('class', 'tooltip-heading')
                .merge(headingSelect)
                .html(heading);

            var textSelect = selection
                .selectAll('.tooltip-text')
                .data(text ? [text] :[]);

            textSelect.exit()
                .remove();

            textSelect.enter()
                .append('div')
                .attr('class', 'tooltip-text')
                .merge(textSelect)
                .html(text);

            var keyhintWrap = selection
                .selectAll('.keyhint-wrap')
                .data(keys && keys.length ? [0] : []);

            keyhintWrap.exit()
                .remove();

            var keyhintWrapEnter = keyhintWrap.enter()
                .append('div')
                .attr('class', 'keyhint-wrap');

            keyhintWrapEnter
                .append('span')
                .html(l10n.tHtml('tooltip_keyhint'));

            keyhintWrap = keyhintWrapEnter.merge(keyhintWrap);

            keyhintWrap.selectAll('kbd.shortcut')
                .data(keys && keys.length ? keys : [])
                .enter()
                .append('span')
                .html(d => {
                    const keysArray = d.split('');
                    return keysArray.map(key => `<kbd class="shortcut">${uiCmd.display(context, key)}</kbd>`)
                    .join('<span>+</span>');
                })
                .style('white-space', 'nowrap');
        };
    });

    return tooltip;
}
