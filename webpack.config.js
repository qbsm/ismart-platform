const path = require('path');
const { WebpackManifestPlugin } = require('webpack-manifest-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  entry: {
    main: './assets/js/main.js',
  },
  output: {
    filename: '[name].[contenthash:8].js',
    path: path.resolve(__dirname, 'assets/js/build'),
    chunkFilename: '[name].[contenthash:8].js',
    clean: true,
    publicPath: 'auto',
  },
  // Старые, но живые браузеры (встроенный браузер приложения «Яндекс» на Android 8 — Chrome 64) не
  // разбирают ES2019+ (`?.`, `??`, `catch {}`): бандл падал целиком, и формы не отправлялись — так
  // avtofin.org потерял заявку 19.10.2026. Свой код — через Babel под browserslist из package.json:
  // только синтаксис, +0,2 КБ. core-js не подключаем — он добавлял всем +33 КБ gzip ради ~0,05%
  // визитов и не закрывал главного (AbortController); недостающее API — точечно в коде
  // (form-callback/abort.js), запрет — в eslint.config.js. Итог проверяет `npm run check:es`.
  target: ['web', 'es2017'],
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules[\\/](?!(swiper|dom7|ssr-window)[\\/])/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [['@babel/preset-env', { bugfixes: true }]],
            sourceType: 'unambiguous',
            cacheDirectory: true,
          },
        },
      },
      {
        test: /\.css$/,
        use: [isProduction ? MiniCssExtractPlugin.loader : 'style-loader', 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif|webp)$/i,
        type: 'asset/resource',
      },
    ],
  },
  optimization: {
    moduleIds: 'deterministic',
    runtimeChunk: 'single',
    splitChunks: {
      chunks: 'all',
      maxInitialRequests: 5,
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
          chunks: 'all',
        },
        ui: {
          test: /[\\/]node_modules[\\/](swiper|glightbox)/,
          name: 'ui-vendors',
          priority: 20,
          chunks: 'all',
        },
        utils: {
          test: /[\\/]node_modules[\\/](inputmask|jquery)/,
          name: 'util-vendors',
          priority: 20,
          chunks: 'all',
        },
        common: {
          name: 'common',
          minChunks: 2,
          priority: 5,
          chunks: 'all',
          reuseExistingChunk: true,
        },
      },
    },
  },
  resolve: {
    extensions: ['.js', '.css'],
  },
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  devtool: process.env.NODE_ENV === 'production' ? false : 'source-map',
  watchOptions: {
    ignored: /node_modules/,
    poll: 1000,
  },
  plugins: [
    new WebpackManifestPlugin({
      fileName: 'asset-manifest.json',
      publicPath: 'assets/js/build/',
    }),
    ...(isProduction
      ? [
          new MiniCssExtractPlugin({
            filename: '[name].[contenthash:8].css',
            chunkFilename: '[name].[contenthash:8].css',
          }),
        ]
      : []),
  ],
};
