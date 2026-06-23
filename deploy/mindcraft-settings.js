const settings = {
    "minecraft_version": "1.21.1", // Shellia-World est en vanilla 1.21.1
    "host": "192.168.1.137",       // VM MGG-PANEL (Shellia-World tourne dessus)
    "port": 25570,                 // port du serveur Shellia-World
    "auth": "offline",             // Shellia-World est en ONLINE_MODE=false

    "mindserver_port": 8080,
    "auto_open_ui": false,         // serveur headless, pas de navigateur

    "base_profile": "assistant",   // modes de jeu (self_preservation, unstuck, item_collecting...)
    "profiles": [
        "./profiles/shellia.json"
    ],

    "load_memory": true,           // MEMOIRE PERSISTANTE : recharge la memoire de la session precedente
    "init_message": "Presente-toi en une phrase, en francais.",
    "only_chat_with": [],

    "speak": false,
    "chat_ingame": true,
    "language": "fr",
    "render_bot_view": false,

    "allow_insecure_coding": true,  // ACTIVE : permet !newAction (Shellia code des routines = enchainements fiables)
    "allow_vision": false,
    "blocked_actions" : ["!checkBlueprint", "!checkBlueprintLevel", "!getBlueprint", "!getBlueprintLevel"],
    "code_timeout_mins": 5,         // garde-fou : une routine codee ne tourne pas a l'infini
    "relevant_docs_count": 8,       // plus de skills/fonctions dispo pour coder des taches

    "max_messages": 25,             // memoire de conversation plus longue (retient mieux ce qu'on lui dit)
    "num_examples": 2,
    "max_commands": -1,
    "show_command_syntax": "full", // DeepSeek (cloud) est rapide → on remet la doc complete pour de meilleures actions
    "narrate_behavior": true,
    "chat_bot_messages": true,

    "spawn_timeout": 60,           // vanilla join peut etre lent, on laisse 60s
    "block_place_delay": 0,
    "log_all_prompts": false,
};

export default settings;
