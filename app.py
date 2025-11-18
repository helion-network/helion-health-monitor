from functools import partial
from pathlib import Path

import hivemind
from flask import Flask, abort, jsonify, request, send_from_directory
from flask_cors import CORS

import config
from p2p_utils import check_reachability
from state_updater import StateUpdaterThread

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST = BASE_DIR / "frontend" / "health-ui" / "dist"

logger = hivemind.get_logger(__name__)


def _serve_frontend(path: str):
    if not FRONTEND_DIST.exists():
        logger.error("Requested frontend asset %s, but build directory %s is missing", path, FRONTEND_DIST)
        return (
            "Frontend build not found. Run `npm install && npm run build` inside frontend/health-ui.",
            503,
        )
    return send_from_directory(FRONTEND_DIST, path)


def _serve_index():
    return _serve_frontend("index.html")


logger.info("Connecting to DHT")
dht = hivemind.DHT(initial_peers=config.INITIAL_PEERS, client_mode=True, num_workers=32, start=True)

logger.info("Starting Flask app")
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

logger.info("Starting updater")
updater = StateUpdaterThread(dht, app, daemon=True)
updater.start()
updater.ready.wait()


@app.route("/api/v1/state")
def api_v1_state():
    return app.response_class(response=updater.state_json, status=200, mimetype="application/json")


@app.route("/api/v1/is_reachable/<peer_id>")
def api_v1_is_reachable(peer_id):
    peer_id = hivemind.PeerID.from_base58(peer_id)
    rpc_info = dht.run_coroutine(partial(check_reachability, peer_id, use_cache=False))
    return jsonify(
        success=rpc_info["ok"],
        message=rpc_info.get("error"),
        your_ip=request.remote_addr,
    )


@app.route("/metrics")
@app.route("/api/prometheus")
def metrics():
    return app.response_class(response=updater.prometheus_metrics, status=200, mimetype="text/plain")


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path.startswith("api/") or path in {"api", "metrics", "api/prometheus"}:
        abort(404)

    requested_path = FRONTEND_DIST / path
    if path and FRONTEND_DIST.exists() and requested_path.is_file():
        return send_from_directory(FRONTEND_DIST, path)

    return _serve_index()
