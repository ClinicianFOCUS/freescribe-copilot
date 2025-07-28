const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = (env = {}) => {
    const isProduction = env.production;

    return {
        entry: {
            background: "./src/background.js",
            content: ["./src/content.js", "./src/content.scss"],
            options: "./src/options.js",
            welcome: "./src/welcome.js",
            offscreen: "./src/offscreen.js",
            history: "./src/history.js",
            main: "./src/main.scss",
            popup: "./src/popup.js",
        },
        output: {
            filename: "[name].js",
            path: path.resolve(__dirname, "dist"),
            clean: true,
            publicPath: "/",
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    use: {
                        loader: "babel-loader",
                    },
                },
                {
                    test: /\.scss$/,
                    use: [
                        MiniCssExtractPlugin.loader,
                        "css-loader",
                        {
                            loader: "sass-loader",
                            options: {
                                sassOptions: {
                                    loadPaths: [path.resolve(__dirname, "node_modules")],
                                    quietDeps: true,
                                    style: "expanded"
                                }
                            }
                        }
                    ],
                },
            ],
        },
        plugins: [
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: "src/*.html",
                        to: "[name].html",
                    },
                    {
                        from: "common",
                        to: "",
                    },
                    {
                        from: "node_modules/bootstrap/dist/js/bootstrap.bundle.min.js",
                        to: "",
                    },
                    {
                        from: "node_modules/bootstrap/dist/css/bootstrap.css",
                        to: "",
                    },
                    {
                        from: "node_modules/toastr/build/toastr.min.js",
                        to: "",
                    },
                    {
                        from: "node_modules/toastr/build/toastr.css",
                        to: "",
                    },
                    {
                        from: "node_modules/@huggingface/transformers/dist/transformers.min.js",
                        to: "",
                    },
                    {
                        from: "node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm",
                        to: "",
                    },
                    {
                        from: "src/worker.js",
                        to: "",
                    },
                    {
                        from: "src/manifest.json",
                        to: "",
                    },
                ],
            }),
            new MiniCssExtractPlugin({
                filename: "[name].css",
            }),
        ],
        resolve: {
            extensions: [".js", ".scss", ".json"],
        },
        optimization: {
            splitChunks: {
                chunks: "all",
            },
        },
        mode: isProduction ? "production" : "development",
        devtool: isProduction ? "source-map" : "inline-source-map",
    }
};
