import { geoSphericalDistance, vecNormalizedDot } from '@rapid-sdk/math';
import { uiCmd } from '../cmd';

/**
 * insert an icon
 */
export function icon(name, klass) {
  const svgklass = 'icon' + (klass ? ` ${klass}` : '');
  return `<svg class="${svgklass}"><use xlink:href="${name}"></use></svg>`;
}


/**
 * event handler that just cancels the event
 */
export function eventCancel(d3_event) {
  d3_event.stopPropagation();
  d3_event.preventDefault();
}


// Returns the localized HTML element for `id` with a standardized set of icon, key, and
// label replacements suitable for tutorials and documentation. Optionally supplemented
// with custom `replacements`
let helpStringReplacements;
export function helpHtml(context, id, replacements) {
  const l10n = context.systems.l10n;
  const isRTL = l10n.isRTL();

  // only load these the first time
  if (!helpStringReplacements) {
    helpStringReplacements = {
      // insert icons corresponding to various UI elements
      point_icon: icon('#rapid-icon-point', 'inline'),
      line_icon: icon('#rapid-icon-line', 'inline'),
      area_icon: icon('#rapid-icon-area', 'inline'),
      note_icon: icon('#rapid-icon-note', 'inline add-note'),
      plus: icon('#rapid-icon-plus', 'inline'),
      minus: icon('#rapid-icon-minus', 'inline'),
      layers_icon: icon('#rapid-icon-layers', 'inline'),
      data_icon: icon('#rapid-icon-data', 'inline'),
      inspect: icon('#rapid-icon-inspect', 'inline'),
      help_icon: icon('#rapid-icon-help', 'inline'),
      undo_icon: icon(isRTL ? '#rapid-icon-redo' : '#rapid-icon-undo', 'inline'),
      redo_icon: icon(isRTL ? '#rapid-icon-undo' : '#rapid-icon-redo', 'inline'),
      save_icon: icon('#rapid-icon-save', 'inline'),

      // operation icons
      circularize_icon: icon('#rapid-operation-circularize', 'inline operation'),
      continue_icon: icon('#rapid-operation-continue', 'inline operation'),
      copy_icon: icon('#rapid-operation-copy', 'inline operation'),
      delete_icon: icon('#rapid-operation-delete', 'inline operation'),
      disconnect_icon: icon('#rapid-operation-disconnect', 'inline operation'),
      downgrade_icon: icon('#rapid-operation-downgrade', 'inline operation'),
      extract_icon: icon('#rapid-operation-extract', 'inline operation'),
      merge_icon: icon('#rapid-operation-merge', 'inline operation'),
      move_icon: icon('#rapid-operation-move', 'inline operation'),
      orthogonalize_icon: icon('#rapid-operation-orthogonalize', 'inline operation'),
      paste_icon: icon('#rapid-operation-paste', 'inline operation'),
      reflect_long_icon: icon('#rapid-operation-reflect-long', 'inline operation'),
      reflect_short_icon: icon('#rapid-operation-reflect-short', 'inline operation'),
      reverse_icon: icon('#rapid-operation-reverse', 'inline operation'),
      rotate_icon: icon('#rapid-operation-rotate', 'inline operation'),
      split_icon: icon('#rapid-operation-split', 'inline operation'),
      straighten_icon: icon('#rapid-operation-straighten', 'inline operation'),

      // interaction icons
      leftclick: icon('#rapid-walkthrough-mouse-left', 'inline operation'),
      rightclick: icon('#rapid-walkthrough-mouse-right', 'inline operation'),
      mousewheel_icon: icon('#rapid-walkthrough-mousewheel', 'inline operation'),
      tap_icon: icon('#rapid-walkthrough-tap', 'inline operation'),
      doubletap_icon: icon('#rapid-walkthrough-doubletap', 'inline operation'),
      longpress_icon: icon('#rapid-walkthrough-longpress', 'inline operation'),
      touchdrag_icon: icon('#rapid-walkthrough-touchdrag', 'inline operation'),
      pinch_icon: icon('#rapid-walkthrough-pinch-apart', 'inline operation'),

      // insert keys; may be localized and platform-dependent
      shift: uiCmd.display(context, '⇧'),
      alt: uiCmd.display(context, '⌥'),
      return: uiCmd.display(context, '↵'),
      esc: l10n.tHtml('shortcuts.key.esc'),
      space: l10n.tHtml('shortcuts.key.space'),
      add_note_key: l10n.tHtml('modes.add_note.key'),
      help_key: l10n.tHtml('help.key'),
      shortcuts_key: l10n.tHtml('shortcuts.toggle.key'),

      // reference localized UI labels directly so that they'll always match
      save: l10n.tHtml('save.title'),
      undo: l10n.tHtml('undo.title'),
      redo: l10n.tHtml('redo.title'),
      upload: l10n.tHtml('commit.save'),
      point: l10n.tHtml('modes.add_point.title'),
      line: l10n.tHtml('modes.add_line.title'),
      area: l10n.tHtml('modes.add_area.title'),
      note: l10n.tHtml('modes.add_note.label'),

      circularize: l10n.tHtml('operations.circularize.title'),
      continue: l10n.tHtml('operations.continue.title'),
      copy: l10n.tHtml('operations.copy.title'),
      delete: l10n.tHtml('operations.delete.title'),
      disconnect: l10n.tHtml('operations.disconnect.title'),
      downgrade: l10n.tHtml('operations.downgrade.title'),
      extract: l10n.tHtml('operations.extract.title'),
      merge: l10n.tHtml('operations.merge.title'),
      move: l10n.tHtml('operations.move.title'),
      orthogonalize: l10n.tHtml('operations.orthogonalize.title'),
      paste: l10n.tHtml('operations.paste.title'),
      reflect_long: l10n.tHtml('operations.reflect.title.long'),
      reflect_short: l10n.tHtml('operations.reflect.title.short'),
      reverse: l10n.tHtml('operations.reverse.title'),
      rotate: l10n.tHtml('operations.rotate.title'),
      split: l10n.tHtml('operations.split.title'),
      straighten: l10n.tHtml('operations.straighten.title'),

      map_data: l10n.tHtml('map_data.title'),
      osm_notes: l10n.tHtml('map_data.layers.notes.title'),
      fields: l10n.tHtml('inspector.fields'),
      tags: l10n.tHtml('inspector.tags'),
      relations: l10n.tHtml('inspector.relations'),
      new_relation: l10n.tHtml('inspector.new_relation'),
      turn_restrictions: l10n.tHtml('_tagging.presets.fields.restrictions.label'),
      background_settings: l10n.tHtml('background.description'),
      imagery_offset: l10n.tHtml('background.fix_misalignment'),
      start_the_walkthrough: l10n.tHtml('splash.walkthrough'),
      help: l10n.tHtml('help.title'),
      ok: l10n.tHtml('intro.ok')
    };
  }

  let reps;
  if (replacements) {
    reps = Object.assign(replacements, helpStringReplacements);
  } else {
    reps = helpStringReplacements;
  }

  return l10n.tHtml(id, reps).replace(/\`(.*?)\`/g, '<kbd>$1</kbd>');   // use keyboard key styling for shortcuts
}


/**
 * slugify
 * @param  text
 */
function slugify(text) {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with '-'
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple '-' with single '-'
    .replace(/^-+/, '')             // Trim '-' from start of text
    .replace(/-+$/, '');            // Trim '-' from end of text
}


export let missingStrings = {};

/**
 * _checkKey
 * Warn about any missing walkthrough names
 * @param  key
 * @param  text
 */
function _checkKey(context, key, text) {
  const l10n = context.systems.l10n;
  if (l10n.t(key, { default: undefined }) === undefined) {
    if (missingStrings.hasOwnProperty(key)) return;  // warn once
    missingStrings[key] = text;
    const missing = `${key}: ${text}`;
    if (typeof console !== 'undefined') console.log(missing); // eslint-disable-line
  }
}

/**
 * localize
 * Localize the given walkthrough entity
 * @param  obj
 */
export function localize(context, obj) {
  const l10n = context.systems.l10n;
  let key;

  // Assign name if entity has one..
  let name = obj.tags && obj.tags.name;
  if (name) {
    key = 'intro.graph.name.' + slugify(name);
    obj.tags.name = l10n.t(key, { default: name });
    _checkKey(context, key, name);
  }

  // Assign street name if entity has one..
  let street = obj.tags && obj.tags['addr:street'];
  if (street) {
    key = 'intro.graph.name.' + slugify(street);
    obj.tags['addr:street'] = l10n.t(key, { default: street });
    _checkKey(context, key, street);

    // Add address details common across walkthrough..
    const addrTags = [
      'block_number', 'city', 'county', 'district', 'hamlet', 'neighbourhood',
      'postcode', 'province', 'quarter', 'state', 'subdistrict', 'suburb'
    ];

    for (const k of addrTags) {
      const key = `intro.graph.${k}`;
      const tag = `addr:${k}`;
      const val = obj.tags && obj.tags[tag];
      const str = l10n.t(key, { default: val });

      if (str) {
        if (str.match(/^<.*>$/) !== null) {
          delete obj.tags[tag];
        } else {
          obj.tags[tag] = str;
        }
      }
    }
  }

  return obj;
}


/**
 * isMostlySquare
 * Used to detect squareness.. some duplicataion of code from actionOrthogonalize.
 * @param  points
 */
export function isMostlySquare(points) {
  // note: uses 15 here instead of the 12 from actionOrthogonalize because
  // actionOrthogonalize can actually straighten some larger angles as it iterates
  const threshold = 15; // degrees within right or straight
  const lowerBound = Math.cos((90 - threshold) * Math.PI / 180);  // near right
  const upperBound = Math.cos(threshold * Math.PI / 180);         // near straight

  for (let i = 0; i < points.length; i++) {
    const a = points[(i - 1 + points.length) % points.length];
    const origin = points[i];
    const b = points[(i + 1) % points.length];

    const dotp = vecNormalizedDot(a, b, origin);
    const mag = Math.abs(dotp);
    if (mag > lowerBound && mag < upperBound) {
      return false;
    }
  }

  return true;
}


/**
 * transitionTime
 * Take a bit more time if the locations are further apart
 * @param   loc1  `Array` [lon,lat]
 * @param   loc2  `Array` [lon,lat]
 * @return  milliseconds to ease from `loc1` to `loc2`
 */
export function transitionTime(loc1, loc2) {
  const dist = geoSphericalDistance(loc1, loc2);
  if (dist < 1e-4) {
    return 0;
  } else if (dist < 200) {   // meters
    return 500;
  } else {
    return 1000;
  }
}


/**
 * delayAsync
 * Wait for animations or other stuff to finish before continuing.
 * We have a bunch of animations that happen all throughout the app.
 * For example, to open preset picker or side panes.
 * History transitions finish in 150ms, and the default for d3 transition is 250ms.
 * @param  ms  milliseconds of delay (defaults to 300)
 * @return Promise that settles after the delay
 */
export function delayAsync(ms = 300) {
  return new Promise(resolve => window.setTimeout(resolve, ms));  // eslint-disable-line no-promise-executor-return
}
