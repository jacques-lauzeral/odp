#!/bin/bash

# odp-admin-podman - Neo4j backup/restore utility for ODP (Podman/Kubernetes)

# Defaults
YAML_FILE="./odp-deployment.yaml"
DATA_DIR=""
NEO4J_IMAGE=""
BACKUP_DIR=""
BACKUP_DIR_SET=false

usage() {
    cat << 'EOF'
Usage: odp-admin-podman <command> [options]

Commands:
  dump    Stop pod, dump database to backup dir, restart pod
  load    Stop pod, load database from backup dir, restart pod

Options:
  -y, --yaml <path>         Deployment YAML file (default: ./odp-deployment.yaml)
  -b, --backup-dir <path>   Backup directory
                            dump: default ~/odp-backups/<timestamp>
                            load: required
  -d, --data-dir <path>     Neo4j data directory (default: auto-detect from YAML)
  -i, --image <name>        Neo4j image (default: auto-detect from YAML)
  -h, --help                Show this help

Examples:
  # Dump database (auto-detect config from YAML)
  odp-admin-podman dump

  # Dump to specific directory
  odp-admin-podman dump -b /path/to/backup

  # Restore from backup
  odp-admin-podman load -b ~/odp-backups/20260211-1430

  # Use custom YAML location
  odp-admin-podman dump -y /path/to/deployment.yaml
EOF
}

# Show help if no arguments
if [[ $# -eq 0 ]]; then
    usage
    exit 0
fi

# Parse arguments
COMMAND=""

while [[ $# -gt 0 ]]; do
    case $1 in
        dump|load)
            COMMAND="$1"
            shift
            ;;
        -y|--yaml)
            YAML_FILE="$2"
            shift 2
            ;;
        -b|--backup-dir)
            BACKUP_DIR="$2"
            BACKUP_DIR_SET=true
            shift 2
            ;;
        -d|--data-dir)
            DATA_DIR="$2"
            shift 2
            ;;
        -i|--image)
            NEO4J_IMAGE="$2"
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

# Extract Neo4j data directory from YAML if not provided
extract_data_dir() {
    if [[ -z "$DATA_DIR" ]]; then
        if [[ ! -f "$YAML_FILE" ]]; then
            echo "Error: YAML file not found: $YAML_FILE"
            exit 1
        fi

        # Extract hostPath for neo4j-data volume
        DATA_DIR=$(grep -A2 "name: neo4j-data" "$YAML_FILE" | grep "path:" | awk '{print $2}')

        if [[ -z "$DATA_DIR" ]]; then
            echo "Error: Could not extract Neo4j data directory from $YAML_FILE"
            echo "Please specify manually with -d option"
            exit 1
        fi

        echo "==> Detected Neo4j data directory: $DATA_DIR"
    fi

    if [[ ! -d "$DATA_DIR" ]]; then
        echo "Error: Neo4j data directory does not exist: $DATA_DIR"
        exit 1
    fi
}

# Extract Neo4j image from YAML if not provided
extract_neo4j_image() {
    if [[ -z "$NEO4J_IMAGE" ]]; then
        if [[ ! -f "$YAML_FILE" ]]; then
            echo "Error: YAML file not found: $YAML_FILE"
            exit 1
        fi

        # Find neo4j container definition and extract image
        NEO4J_IMAGE=$(awk '/- name: neo4j/,/^  - name:/ {if (/image:/) print $2}' "$YAML_FILE" | head -1)

        if [[ -z "$NEO4J_IMAGE" ]]; then
            echo "Warning: Could not extract Neo4j image from $YAML_FILE"
            NEO4J_IMAGE="yagi.cfmu.corp.eurocontrol.int:5000/neo4j:5-community"
            echo "==> Using fallback image: $NEO4J_IMAGE"
        else
            echo "==> Detected Neo4j image: $NEO4J_IMAGE"
        fi
    fi
}

do_dump() {
    extract_data_dir
    extract_neo4j_image

    # Set default backup dir with timestamp for dump
    if [[ -z "$BACKUP_DIR" ]]; then
        BACKUP_DIR="$HOME/odp-backups/$(date +%Y%m%d-%H%M)"
    fi

    echo "==> Creating backup directory: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
    chmod 777 "$BACKUP_DIR"

    echo "==> Stopping ODP pod"
    podman play kube --down "$YAML_FILE"

    echo "==> Dumping database to: $BACKUP_DIR"
    podman run --rm \
        --entrypoint neo4j-admin \
        -v "$DATA_DIR":/data \
        -v "$BACKUP_DIR":/backup \
        "$NEO4J_IMAGE" \
        database dump neo4j --to-path=/backup

    echo "==> Starting ODP pod"
    podman play kube "$YAML_FILE"

    echo "==> Backup complete: $BACKUP_DIR/neo4j.dump"
}

do_load() {
    if [[ "$BACKUP_DIR_SET" != true ]]; then
        echo "Error: --backup-dir is required for load command"
        echo "Usage: odp-admin-podman load -b <backup-dir>"
        exit 1
    fi

    if [[ ! -f "$BACKUP_DIR/neo4j.dump" ]]; then
        echo "Error: Backup file not found: $BACKUP_DIR/neo4j.dump"
        exit 1
    fi

    extract_data_dir
    extract_neo4j_image

    echo "==> Stopping ODP pod"
    podman play kube --down "$YAML_FILE"

    echo "==> Loading database from: $BACKUP_DIR"
    podman run --rm \
        --entrypoint neo4j-admin \
        -v "$DATA_DIR":/data \
        -v "$BACKUP_DIR":/backup \
        "$NEO4J_IMAGE" \
        database load neo4j --from-path=/backup --overwrite-destination=true

    echo "==> Starting ODP pod"
    podman play kube "$YAML_FILE"

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
