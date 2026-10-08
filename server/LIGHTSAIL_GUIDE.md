# Setting up cruise.obviewer.com on AWS Lightsail

One small Linux server does everything: nginx serves the map and the tiles, and a scheduled
job downloads Copernicus data and makes new tiles at 06:00 and 18:00 UTC.

Every step ends with a **✅ Check**. Don't continue until the check passes. If it doesn't,
stop and note exactly what you see.

You'll use:
- the AWS console (https://console.aws.amazon.com) → **Lightsail**,
- your **Hover** account (for one DNS record),
- the Lightsail browser terminal (no software to install on your computer).

Time: ~30 minutes of setup, then ~1 hour for the first tiles.
Cost: **$24/month** for the server. The static IP address is free while attached to it.

---

## Step 1: Create the server

1. Sign in to the AWS console. In the search bar type **Lightsail** and open it.
   (Lightsail has its own simpler console, separate from the rest of AWS.)
2. Click **Create instance**.
3. **Instance location:** keep the suggested region or pick one; any works. obviewer.com
   runs in Ohio (us-east-2), so choosing **Ohio** keeps things in one place.
4. **Select a platform:** **Linux/Unix**. **Select a blueprint:** **OS Only** → **Ubuntu 24.04 LTS**.
5. **Choose your instance plan:** pick **Dual-stack**, then the **$24 USD** plan
   (4 GB memory, 2 vCPUs, 80 GB SSD).
6. **Identify your instance:** name it `cruise`.
7. Click **Create instance**.

✅ **Check:** after 1–2 minutes the `cruise` card shows **Running** and a public IP address.

---

## Step 2: Give it a permanent IP address

Without this step, the IP address changes whenever the server restarts and the website breaks.

1. Click the `cruise` instance → **Networking** tab.
2. Under **IPv4 networking** click **Attach static IP** (or **Create static IP**). Name it
   `cruise-ip`, make sure it's attached to `cruise`, and click **Create** / **Attach**.

✅ **Check:** the Networking tab shows a **Static IP** address. **Write it down**; steps
3 and 4 use it.

---

## Step 3: Open the HTTPS port

1. Same **Networking** tab → **IPv4 Firewall** → **Add rule**.
2. Application: **HTTPS** (port 443 fills in automatically) → **Create**.

✅ **Check:** the IPv4 firewall lists three rules: **SSH 22**, **HTTP 80**, **HTTPS 443**.

---

## Step 4: Point cruise.obviewer.com at the server (Hover)

1. Sign in to Hover → **obviewer.com** → **DNS** tab.
2. **Don't change any existing records.** They keep obviewer.com working.
3. Click **Add a record**:
   - Type: **A**
   - Hostname: `cruise`
   - IP address: the static IP from step 2
   - TTL: leave the default
4. Save.

✅ **Check (wait 5–30 minutes):** on your computer, open PowerShell and run
```powershell
nslookup cruise.obviewer.com
```
The last `Address:` line shows your static IP. Also open https://obviewer.com to confirm it
still works as before.

> Still no answer after an hour? In Hover, check the record's hostname is exactly `cruise`
> (not `cruise.obviewer.com`) and the type is **A**.

You can do steps 5 and 7 while you wait. Step 6 (HTTPS) needs this check to pass.

---

## Step 5: Install everything

1. In Lightsail, open the `cruise` instance and click **Connect using SSH**. A terminal
   opens in a new browser window.
   To paste in that window, use **Ctrl+Shift+V**, or the clipboard icon at the bottom right.
2. Download the code:
   ```bash
   sudo git clone https://github.com/wkumler/seaview.git /opt/seaview
   ```
3. Run the installer:
   ```bash
   sudo bash /opt/seaview/server/install.sh
   ```
   It shows `==>` headings as it goes. The image build takes 5–10 minutes.
   Partway through it asks for your **Copernicus Marine username and password**. Nothing
   appears on screen while you type the password; that's normal. Press Enter when done.
   The login is saved on the server in a file only the administrator can read.

✅ **Check:** the installer ends with **`==> Done`** and a table showing `seaview-daily.timer`
with a **NEXT** time of the coming 06:00 or 18:00 UTC.

✅ **Check:** in your browser, open `http://<your static IP>/` (note **http**, not https).
The map loads with the WAM, SubSEA and BioReactors stations and the Falkor (too). The
satellite date list is empty until step 7 finishes. That's expected.

> If the installer stops with a red error, copy the last ~20 lines of the terminal and send
> them to me. It's safe to re-run the installer after fixing the problem.

---

## Step 6: Turn on HTTPS

Needs the step 4 check to pass first.

```bash
sudo certbot --nginx -d cruise.obviewer.com --redirect
```
certbot asks three things:
- **Email address:** yours. Let's Encrypt emails you only if renewal ever fails.
- **Terms of service:** read them and answer **Y** to agree.
- **Share email with the EFF:** your choice (**N** is fine).

✅ **Check:** certbot prints **"Successfully deployed certificate"**.
Then open **https://cruise.obviewer.com**: the map loads with a padlock in the address bar.
Opening **http://cruise.obviewer.com** should redirect to https.

✅ **Check:** automatic renewal works:
```bash
sudo certbot renew --dry-run
```
ends with **"Congratulations, all simulated renewals succeeded"**. Certificates last 90 days
and renew automatically, so you won't need to do this again.

---

## Step 7: First tile run

The timer starts the job at 06:00 and 18:00 UTC. To get tiles now, start it by hand:

```bash
sudo systemctl start --no-block seaview-daily
sudo journalctl -u seaview-daily -f
```
The second command shows the log as it's written. Press **Ctrl+C** to stop watching; the
job keeps running and you can close the window.

The first run fills in the last 3 days for 3 products. Later runs only add the newest day.
Both should take minutes; at most an hour if the server's CPU is being throttled.

✅ **Check (when finished):**
```bash
systemctl status seaview-daily --no-pager
```
shows `status=0/SUCCESS`. Reload the map: the left panel lists dates for SSH, SST and Chl, and
ticking one shows the satellite layer. The legend (colorbars) shows at the bottom right.

> `status=1/FAILURE`: look for `FAILED` lines with
> `sudo journalctl -u seaview-daily --no-pager | grep FAILED`.
> Lines saying **"no data available yet"** are normal (Copernicus hasn't published that day
> yet), and the next run retries them. A Copernicus login error means the username or
> password is wrong. To fix it, run `sudo rm /etc/seaview/cmems.env`, then re-run the
> installer (step 5.3).

---

## Step 8: Take a backup snapshot (recommended)

1. Lightsail → `cruise` instance → **Snapshots** tab → **Create snapshot**.

✅ **Check:** the snapshot shows as **Available** after a few minutes. If anything breaks
later, you can create a new instance from it. Optionally turn on **Automatic snapshots** on
the same tab for a daily backup (a few dollars a month).

---

## Step 9 (optional): Link it from obviewer.com

Add a link to `https://cruise.obviewer.com` on obviewer.com's front page so the team finds it
alongside your other data products. obviewer.com keeps its Basecamp login. The cruise map is
separate and public.

---

## Everyday tasks

All commands run in the Lightsail browser terminal (**Connect using SSH**).

| Task | How |
| --- | --- |
| Update stations, map, settings or code | Commit and push the change to GitHub, then on the server: `sudo bash /opt/seaview/server/install.sh` |
| See when the job runs next | `systemctl list-timers seaview-daily` |
| Read the last run's log | `sudo journalctl -u seaview-daily -n 100 --no-pager` |
| Run the job now | `sudo systemctl start --no-block seaview-daily` |
| Redo one day (e.g. after changing colour ranges) | `sudo rm -rf /srv/cruise/tiles/WAM/ostia/2026-10-05`, then run the job |
| Change the Copernicus password | `sudo rm /etc/seaview/cmems.env`, then re-run the installer |
| Check free disk space | `df -h /` (tiles use ~165 MB/day; 80 GB lasts well over a year) |
| Pause the daily job | `sudo systemctl disable --now seaview-daily.timer` (resume with `enable --now`) |

Ubuntu installs security updates automatically. Restart the server now and then from the
Lightsail console (**⋮ → Reboot**). Everything starts again by itself.

## After the cruise

1. Lightsail → `cruise` → **⋮ → Delete**.
2. Lightsail → **Networking** → delete the static IP `cruise-ip`. **An unattached static IP
   is charged**, so don't skip this.
3. Delete any snapshots you no longer need (**Snapshots** in the Lightsail menu).
4. Hover → obviewer.com → DNS → delete the `cruise` A record.

✅ **Check:** Lightsail shows no instances, static IPs or snapshots for `cruise`.
