#!/bin/bash

# odp-bin - Neo4j backup/restore utility for ODP

set -e

# Defaults
CONTAINER="odp-neo4j-1"
VOLUME="odp_neo4j_data"
NEO4J_IMAGE="neo4j:5.15"
BACKUP_DIR_SET=false

usage() {
    echo "Usage: odp-admin <command> [options]"
    echo ""
    echo "Commands:"
    echo "  dump    Stop DB, dump to backup dir, restart DB"
    echo "  load    Stop DB, load from backup dir, restart DB"
    echo ""
    echo "Options:"
    echo "  -c, --container <name>    Container name (default: odp-neo4j-1)"
    echo "  -b, --backup-dir <path>   Backup directory"
    echo "                            dump: default ~/odp-backups/<timestamp>"
    echo "                            load: required"
    echo "  -h, --help                Show this help"
    exit 1
}

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
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

if [[ -z "$COMMAND" ]]; then
    echo "Error: No command specified"
    usage
fi

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
    docker run --rm \
        -v "$VOLUME":/data \
        -v "$BACKUP_DIR":/backup \
        "$NEO4J_IMAGE" \
        neo4j-bin database dump neo4j --to-path=/backup

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
    docker run --rm \
        -v "$VOLUME":/data \
        -v "$BACKUP_DIR":/backup \
        "$NEO4J_IMAGE" \
        neo4j-bin database load neo4j --from-path=/backup --overwrite-destination=true

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