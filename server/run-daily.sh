#!/usr/bin/env bash
# Run the tile job once for each cruise in $CRUISES (set in seaview-daily.service).
# Cruises run one after another. A failure in one doesn't stop the others, but
# makes the whole run report failure so it shows up in `systemctl status`.
set -u

status=0
for cruise in ${CRUISES:-wam}; do
    echo "=== $cruise"
    # A container left over from a run that was killed would block this name forever.
    docker rm -f "seaview-daily-$cruise" >/dev/null 2>&1
    docker run --rm --name "seaview-daily-$cruise" \
        --env-file /etc/seaview/cmems.env \
        -e SEAVIEW_BASE_TILE_DIR=/srv/cruise/tiles \
        -e SEAVIEW_BASE_DATA_DIR=/var/lib/seaview/data \
        -e SEAVIEW_WEB_DIR=/srv/cruise \
        -e PYTHONUNBUFFERED=1 \
        -e TQDM_DISABLE=1 \
        -v /srv/cruise:/srv/cruise \
        -v /var/lib/seaview:/var/lib/seaview \
        seaview-daily daily --env "$cruise" --days "${DAYS:-3}" || status=1
done
exit $status
