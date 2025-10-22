from petals.constants import PUBLIC_INITIAL_PEERS

from data_structures import ModelInfo

# INITIAL_PEERS = PUBLIC_INITIAL_PEERS
INITIAL_PEERS = [
    "/ip4/172.16.51.60/tcp/31337/p2p/QmRDEYd5HvKggXbHT8oudvNae4zDLE6bMQRcR8bhKxE4Ex",
]

MODELS = [
    # ModelInfo(
    #     dht_prefix="Meta-Llama-3-1-405B-Instruct-hf",
    #     repository="meta-llama/Meta-Llama-3.1-405B-Instruct",
    #     num_blocks=126,
    # ),
    # ModelInfo(
    #     dht_prefix="mistralai/Mixtral-8x22B-Instruct-v0-1",
    #     repository="mistralai/Mixtral-8x22B-Instruct-v0.1",
    #     num_blocks=56,
    # ),
    ModelInfo(
        dht_prefix="meta-llama/Llama-3-2-1B-Instruct",
        repository="meta-llama/Llama-3.2-1B-Instruct",
        num_blocks=16,
    ),
]

UPDATE_PERIOD = 60
