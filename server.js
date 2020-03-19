/* eslint-disable no-console */
const colors = require('colors/safe');
const gaze = require('gaze');
const StaticServer = require('static-server');

const buildCSS = require('./build_css.js');


gaze(['css/**/*.css'], (err, watcher) => {
  watcher.on('all', () => buildCSS());
});

const server = new StaticServer({ rootPath: __dirname, port: 8080, followSymlink: true });
  .then(() => startServer());	server.start(() => {

  console.log(colors.yellow('Listening on ' + server.port));

});
function startServer() {	