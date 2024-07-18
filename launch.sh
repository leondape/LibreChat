#!/bin/bash

docker compose \
-f $DEPLOY_DIR/docker-compose.yml \
-f $DEPLOY_DIR/docker-compose.ci.yml \
up -d