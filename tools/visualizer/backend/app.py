from flask import Flask
from flask_cors import CORS


def create_app():
    app = Flask(__name__, static_folder="../frontend/dist", static_url_path="/")
    CORS(app)

    from backend.api import model_datasets, presets, experiments, manifest
    app.register_blueprint(model_datasets.bp)
    app.register_blueprint(presets.bp)
    app.register_blueprint(experiments.bp)
    app.register_blueprint(manifest.bp)

    @app.route("/api/health")
    def health():
        return {"status": "ok"}

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        return app.send_static_file("index.html")

    return app


app = create_app()


def main():
    app.run(debug=True, port=8080)


if __name__ == "__main__":
    main()
