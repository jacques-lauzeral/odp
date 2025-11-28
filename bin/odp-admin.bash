#!/bin/bash

# odp-admin - Neo4j backup/restore utility for ODP

# Defaults
CONTAINER="odp-neo4j-1"
VOLUME="odp_neo4j_data"
NEO4J_IMAGE="neo4j:5.15"
BACKUP_DIR_SET=false

usage() {
    cat << 'EOF'
Usage: odp-admin <command> [options]

Commands:
  dump    Stop DB, dump to backup dir, restart DB
  load    Stop DB, load from backup dir, restart DB

Options:
  -c, --container <name>    Container name (default: odp-neo4j-1)
  -b, --backup-dir <path>   Backup directory
                            dump: default ~/odp-backups/<timestamp>
                            load: required
  -h, --help                Show this help
EOF
}

# Show help if no arguments
if [[ $# -eq 0 ]]; then
    usage
    exit 0
fi

# Parse arguments
COMMAND=""
BACKUP_DIR=""

while [[ $# -gt 0 ]]; do
    case $1 in
        dump|load)
            COMMAND="$1"
            shift
            ;;
        -c|--container)
            CONTAINER="$2"
            shift 2
            ;;
        -b|--backup-dir)
            BACKUP_DIR="$2"
            BACKUP_DIR_SET=true
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

if [[ -z "$COMMAND" ]]; then
    echo "Error: No command specified"
    usage
    exit 1
fi

set -e

do_dump() {
    # Set default backup dir with timestamp for dump
    if [[ -z "$BACKUP_DIR" ]]; then
        BACKUP_DIR="$HOME/odp-backups/$(date +%Y%m%d-%H%M)"
    fi

    echo "==> Creating backup directory: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
    chmod 777 "$BACKUP_DIR"

    echo "==> Stopping container: $CONTAINER"
    docker stop "$CONTAINER"

    echo "==> Dumping database to: $BACKUP_DIR"
    docker run --rm --user root \
        --entrypoint neo4j-admin \
        -v "$VOLUME":/data \
        -v "$BACKUP_DIR":/backup \
        "$NEO4J_IMAGE" \
        database dump neo4j --to-path=/backup

    echo "==> Starting container: $CONTAINER"
    docker start "$CONTAINER"

    echo "==> Backup complete: $BACKUP_DIR/neo4j.dump"
}

do_load() {
    if [[ "$BACKUP_DIR_SET" != true ]]; then
        echo "Error: --backup-dir is required for load command"
        echo "Usage: odp-admin load -b <backup-dir>"
        exit 1
    fi

    if [[ ! -f "$BACKUP_DIR/neo4j.dump" ]]; then
        echo "Error: Backup file not found: $BACKUP_DIR/neo4j.dump"
        exit 1
    fi

    echo "==> Stopping container: $CONTAINER"
    docker stop "$CONTAINER"

    echo "==> Loading database from: $BACKUP_DIR"
    docker run --rm --user root \
        --entrypoint neo4j-admin \
        -v "$VOLUME":/data \
        -v "$BACKUP_DIR":/backup \
        "$NEO4J_IMAGE" \
        database load neo4j --from-path=/backup --overwrite-destination=true

    echo "==> Starting container: $CONTAINER"
    docker start "$CONTAINER"

    echo "==> Restore complete"
}

case $COMMAND in
    dump)
        do_dump
        ;;
    load)
        do_load
        ;;
esac