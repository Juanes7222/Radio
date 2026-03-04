from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import csv
import unicodedata
import re
import yt_dlp

BASE_URL = "https://www.alabanzasmp3.com"
MAX_DOWNLOAD_WORKERS = 4  # adjust based on your connection


def sanitize(name: str) -> str:
    """Remove characters not allowed in file/folder names."""
    forbidden = r'\/:*?"<>|'
    return "".join(c for c in name if c not in forbidden).strip()


def normalize(name: str) -> str:
    """Lowercase, remove accents, punctuation and extra spaces."""
    name = unicodedata.normalize("NFD", name)
    name = "".join(c for c in name if unicodedata.category(c) != "Mn")
    name = name.lower()
    name = re.sub(r"[^a-z0-9\s]", " ", name)
    name = re.sub(r"\s+", " ", name)
    return name.strip()


def get_downloaded_artists(downloads_dir: Path) -> set[str]:
    """Return set of artist folder names already in downloads."""
    if not downloads_dir.exists():
        return set()
    return {folder.name for folder in downloads_dir.iterdir() if folder.is_dir()}


def get_artist_links(page) -> list[dict]:
    """Return all artist links from the main page."""
    page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(2000)

    raw_links = page.eval_on_selector_all(
        "a",
        """els => els.map(e => {
            const img = e.querySelector('img');
            return {
                name: img ? img.getAttribute('title') : e.innerText.trim(),
                href: e.getAttribute('href')
            };
        })"""
    )

    artists = []
    seen = set()

    for item in raw_links:
        name = (item.get("name") or "").strip()
        href = (item.get("href") or "")

        if "artista/" not in href or not name:
            continue
        if href.startswith("//"):
            href = "https:" + href
        if href not in seen:
            seen.add(href)
            artists.append({"name": name, "url": href})

    return artists


def get_songs(page, artist_url: str) -> list[dict]:
    """Return songs from an artist page."""
    try:
        page.goto(artist_url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1500)
        soup = BeautifulSoup(page.content(), "html.parser")
    except Exception as e:
        print(f"  [error] {e}")
        return []

    songs = []
    for li in soup.select("li[id]"):
        source_div = li.find("div", class_="reproducir")
        if not source_div:
            continue
        source = source_div.get("data-source", "")
        if not source:
            continue
        title_tag = li.select_one("div.cancion span strong")
        title = title_tag.get_text(strip=True) if title_tag else li.get("id", "unknown")
        songs.append({"title": title, "url": source})

    return songs


def download_song(song: dict, artist_name: str, base_dir: Path) -> bool:
    """Download full song from YouTube using yt-dlp."""
    artist_dir = base_dir / sanitize(artist_name)
    artist_dir.mkdir(parents=True, exist_ok=True)

    filename = artist_dir / f"{sanitize(song['title'])}.mp3"
    if filename.exists():
        return False

    query = f"{artist_name} {song['title']}"
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": str(artist_dir / f"{sanitize(song['title'])}.%(ext)s"),
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }],
        "quiet": True,
        "noplaylist": True,
        "default_search": f"ytsearch1:{query}",
        "extractor_args": {"youtube": {"js_runtimes": ["nodejs"]}},
        "concurrent_fragment_downloads": 4,  # parallel fragment downloads per song
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([query])
        return filename.exists()
    except Exception as e:
        print(f"    [error] {song['title']}: {e}")
        return False


def download_batch(songs: list[dict], artist_name: str, base_dir: Path):
    """Download a list of songs in parallel."""
    with ThreadPoolExecutor(max_workers=MAX_DOWNLOAD_WORKERS) as executor:
        futures = {
            executor.submit(download_song, song, artist_name, base_dir): song
            for song in songs
        }
        for future in as_completed(futures):
            song = futures[future]
            ok = future.result()
            print(f"    [{'OK' if ok else 'skip'}] {song['title']}")


def scrape_all_songs(page, artists: list[dict]) -> list[dict]:
    """Scrape all songs from all artists first, before downloading."""
    all_songs = []
    for artist in artists:
        print(f"  Scraping: {artist['name']}")
        songs = get_songs(page, artist["url"])
        if songs:
            print(f"    -> {len(songs)} songs")
            for song in songs:
                all_songs.append({**song, "artist": artist["name"]})
    return all_songs


def scrape():
    downloads_dir = Path("downloads")
    downloaded_artists = get_downloaded_artists(downloads_dir)
    print(f"Found {len(downloaded_artists)} artist folders in downloads/")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="es-ES",
        )
        page = context.new_page()

        print("Fetching artist list...")
        artists = get_artist_links(page)
        print(f"Found {len(artists)} artists on site")

        artists = [
            a for a in artists
            if any(normalize(a["name"]) == normalize(d) for d in downloaded_artists)
        ]
        print(f"Filtered to {len(artists)} matching artists")

        # scrape all songs first, then close browser
        all_songs = scrape_all_songs(page, artists)
        browser.close()

    print(f"\nTotal songs to download: {len(all_songs)}")

    # write csv
    with open("alabanzas.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["title", "artist", "url"])
        writer.writeheader()
        writer.writerows(all_songs)

    # download by artist to keep folder structure, parallelized per artist
    songs_by_artist: dict[str, list] = {}
    for song in all_songs:
        songs_by_artist.setdefault(song["artist"], []).append(song)

    for artist_name, songs in songs_by_artist.items():
        print(f"\n  Downloading: {artist_name} ({len(songs)} songs)")
        download_batch(songs, artist_name, downloads_dir)

    print("\nDone -> alabanzas.csv")


if __name__ == "__main__":
    for _ in range(10):
        try:
            scrape()
        except Exception as e:
            print(f"Error during scraping: {e}")
            time.sleep(5)