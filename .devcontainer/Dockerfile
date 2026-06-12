FROM mcr.microsoft.com/devcontainers/typescript-node:20

# Install additional system dependencies
# ffmpeg: required by backend
# sqlite3: for exploring the local DB
# python3/pip: for running the scraping scripts
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
        ffmpeg \
        sqlite3 \
        python3 \
        python3-pip \
        python3-venv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Setup a global python virtual environment so pip works globally easily
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install expo-cli globally (useful for React Native/Expo app)
RUN npm install -g eas-cli
