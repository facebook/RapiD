/* eslint-disable no-console */
// import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import includePaths from 'rollup-plugin-includepaths';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import progress from 'rollup-plugin-progress';
import replace from '@rollup/plugin-replace';

// The "dev" build includes all modules in a single bundle - for now
// * Also generates sourcemaps

export default {
  input: './modules/id.js',
  onwarn: onWarn,
  output: {
    file: 'dist/iD.js',
    format: 'iife',
    sourcemap: true,
    strict: false
  },
  plugins: [
    progress(),
    includePaths({
      paths: ['node_modules/d3/node_modules']  // npm2 or windows
    }),
    nodeResolve({ dedupe: ['object-inspect'] }),
    commonjs({ exclude: 'modules/**' }),
    json({ indent: '' }),
    // Comment out babel for now (needed for React proof-of-cocept)
    // babel({
    //   babelHelpers: 'bundled',
    //   // avoid circular dependencies due to `useBuiltIns: usage` option
    //   exclude: [/\/core-js\//]
    // }),
    replace({
      preventAssignment: true,
      'process.env.NODE_ENV': JSON.stringify( 'production' )
    })
  ]
};

function onWarn(warning, warn) {
  // skip certain warnings
  if (warning.code === 'CIRCULAR_DEPENDENCY') return;
  if (warning.code === 'EVAL') return;

  // Use default for everything else
  console.log(warning.code);
  warn(warning);
}
