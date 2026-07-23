#!/bin/bash

# Asterisk Zero-Cost Installation & Configuration Script (Rooted Android gsm2sip Edition)
# This script installs Asterisk and configures it for WebRTC and a SIP Trunk to your phone.

echo "Starting Asterisk Installation..."

# 1. Update and install prerequisites
sudo apt-get update
sudo apt-get install -y asterisk asterisk-dev asterisk-modules \
  build-essential wget uuid-dev libjansson-dev \
  libxml2-dev sqlite3 libsqlite3-dev

echo "Asterisk installed. Configuring for MooNsConfig..."

# 2. Stop Asterisk to safely configure
sudo systemctl stop asterisk

# 3. Create ARI Configuration (ari.conf)
sudo bash -c 'cat <<EOF > /etc/asterisk/ari.conf
[general]
enabled = yes
pretty = yes
allowed_origins = *

[asterisk]
type = user
read_only = no
password = asterisk
EOF'

# 4. Create HTTP Configuration for WebSocket and ARI (http.conf)
sudo bash -c 'cat <<EOF > /etc/asterisk/http.conf
[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
prefix=

[general](+)
tlsenable=yes
tlsbindaddr=0.0.0.0:8089
tlscertfile=/etc/asterisk/keys/asterisk.pem
EOF'

# 5. Create PJSIP Configuration (pjsip.conf) for WebRTC and Android SIP Gateway
sudo bash -c 'cat <<EOF > /etc/asterisk/pjsip.conf
; --- WebRTC Transport ---
[transport-wss]
type=transport
protocol=wss
bind=0.0.0.0:8089

; --- WebRTC Softphone (React Client) ---
[webrtc_client]
type=aor
max_contacts=1
remove_existing=yes

[webrtc_client]
type=auth
auth_type=userpass
password=webrtc_secret
username=webrtc_client

[webrtc_client]
type=endpoint
aors=webrtc_client
auth=webrtc_client
webrtc=yes
context=default
disallow=all
allow=opus,ulaw

; --- Android Phone SIP Gateway (gsm2sip) ---
[android_gateway]
type=aor
max_contacts=1
remove_existing=yes

[android_gateway]
type=auth
auth_type=userpass
password=android_secret
username=android_gateway

[android_gateway]
type=endpoint
aors=android_gateway
auth=android_gateway
context=incoming-mobile
disallow=all
allow=ulaw,alaw
EOF'

# 6. Generate self-signed TLS certificates for WebRTC
sudo mkdir -p /etc/asterisk/keys
sudo ast_tls_cert -C localhost -O "MooNsConfig" -d /etc/asterisk/keys

# 7. Set permissions and start Asterisk
sudo chown -R asterisk:asterisk /etc/asterisk
sudo systemctl start asterisk
sudo systemctl enable asterisk

echo ""
echo "=========================================================="
echo "Asterisk Installation Complete!"
echo ""
echo "Please configure 'gsm2sip' on your Android phone with:"
echo "Server IP: <Your Windows IP Address>"
echo "Username: android_gateway"
echo "Password: android_secret"
echo ""
echo "To check if it is running, type: sudo asterisk -rvvv"
echo "=========================================================="
