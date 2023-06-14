import { json as d3_json } from 'd3-fetch';
import { utilQsString } from '@rapid-sdk/util';

import { AbstractService } from './AbstractService';

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php?';


/**
 * `WikipediaService`
 */
export class WikipediaService extends AbstractService {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'wikipedia';
  }


  /**
   * search
   * @param  lang
   * @param  query
   * @param  callback
   */
  search(lang, query, callback) {
    if (!query) {
      if (callback) callback('No Query', []);
      return;
    }

    lang = lang || 'en';
    const url = WIKIPEDIA_API.replace('en', lang) +
      utilQsString({
        action: 'query',
        list: 'search',
        srlimit: '10',
        srinfo: 'suggestion',
        format: 'json',
        origin: '*',
        srsearch: query
      });

    d3_json(url)
      .then(result => {
        if (result && result.error) {
          throw new Error(result.error);
        } else if (!result || !result.query || !result.query.search) {
          throw new Error('No Results');
        }
        if (callback) {
          const titles = result.query.search.map(d => d.title);
          callback(null, titles);
        }
      })
      .catch(err => {
        if (callback) callback(err, []);
      });
  }


  /**
   * suggestions
   * @param  lang
   * @param  query
   * @param  callback
   */
  suggestions(lang, query, callback) {
    if (!query) {
      if (callback) callback('', []);
      return;
    }

    lang = lang || 'en';
    const url = WIKIPEDIA_API.replace('en', lang) +
      utilQsString({
        action: 'opensearch',
        namespace: 0,
        suggest: '',
        format: 'json',
        origin: '*',
        search: query
      });

    d3_json(url)
      .then(result => {
        if (result && result.error) {
          throw new Error(result.error);
        } else if (!result || result.length < 2) {
          throw new Error('No Results');
        }
        if (callback) callback(null, result[1] || []);
      })
      .catch(err => {
        if (callback) callback(err.message, []);
      });
  }


  /**
   * translations
   * @param  lang
   * @param  title
   * @param  callback
   */
  translations(lang, title, callback) {
    if (!title) {
      if (callback) callback('No Title');
      return;
    }

    lang = lang || 'en';
    const url = WIKIPEDIA_API.replace('en', lang) +
      utilQsString({
        action: 'query',
        prop: 'langlinks',
        format: 'json',
        origin: '*',
        lllimit: 500,
        titles: title
      });

    d3_json(url)
      .then(result => {
        if (result && result.error) {
          throw new Error(result.error);
        } else if (!result || !result.query || !result.query.pages) {
          throw new Error('No Results');
        }
        if (callback) {
          const list = result.query.pages[Object.keys(result.query.pages)[0]];
          const translations = {};
          if (list && list.langlinks) {
            list.langlinks.forEach(function(d) { translations[d.lang] = d['*']; });
          }
          callback(null, translations);
        }
      })
      .catch(err => {
        if (callback) callback(err.message);
      });
  }

}
