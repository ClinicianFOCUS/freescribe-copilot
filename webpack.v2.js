const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = (env) => {
    const isProduction = env.production;

    return {
        entry: {
            background: "./src-v2/background.js",
            content: ["./src-v2/content.js", "./src-v2/content.scss"],
            options: "./src-v2/options.js",
            welcome: "./src-v2/welcome.js",
            offscreen: "./src-v2/offscreen.js",
            history: "./src-v2/history.js",
            main: "./src-v2/main.scss",
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
                    use: [MiniCssExtractPlugin.loader, "css-loader", "sass-loader"],
                },
            ],
        },
        plugins: [
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: "src-v2/*.html",
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
                        from: "src-v2/worker.js",
                        to: "",
                    },
                    {
                        from: "src-v2/manifest.json",
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
