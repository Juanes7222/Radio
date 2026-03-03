from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
import time
import csv

BASE_URL = "https://mismp3cristianos.com/"


def fetch(page, url: str) -> str:
    """Fetch a URL using a real browser page."""
    page.goto(url, wait_until="domcontentloaded", timeout=20000)
    return page.content()


def get_artist_links(page) -> list[dict]:
    """Return all artist links from the main page."""
    soup = BeautifulSoup(fetch(page, BASE_URL), "html.parser")
    artists = []
    for a in soup.select("div.entry-content a[href*='mismp3cristianos']"):
        href = a.get("href", "")
        name = a.get_text(strip=True)
        if name and href:
            artists.append({"name": name, "url": href})
    return artists


def get_songs(page, page_url: str) -> list[dict]:
    """Return songs from a wp-playlist page."""
    try:
        soup = BeautifulSoup(fetch(page, page_url), "html.parser")
    except Exception as e:
        print(f"  [error] {e}")
        return []

    songs = []
    for a in soup.find_all("a", class_="wp-playlist-caption"):
        href = a.get("href", "")
        if not href.endswith(".mp3"):
            continue

        title_tag = a.find("span", class_="wp-playlist-item-title")
        artist_tag = a.find("span", class_="wp-playlist-item-artist")

        title = title_tag.get_text(strip=True) if title_tag else href.split("/")[-1]
        artist = artist_tag.get_text(strip=True).lstrip("— ") if artist_tag else ""

        songs.append({"title": title, "artist": artist, "url": href})

    return songs

from pathlib import Path

def download_song(page, song: dict, base_dir: Path) -> bool:
    """Download an mp3 file to base_dir/artist/title.mp3."""
    artist_dir = base_dir / sanitize(song["artist"] or "Unknown")
    artist_dir.mkdir(parents=True, exist_ok=True)

    filename = artist_dir / f"{sanitize(song['title'])}.mp3"
    if filename.exists():
        return False

    try:
        # use playwright's API request to reuse the browser session/cookies
        response = page.request.get(song["url"])
        filename.write_bytes(response.body())
        return True
    except Exception as e:
        print(f"    [error] {song['title']}: {e}")
        return False


def sanitize(name: str) -> str:
    """Remove characters not allowed in file/folder names."""
    forbidden = r'\/:*?"<>|«»'
    return "".join(c for c in name if c not in forbidden).strip()

def scrape():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="es-ES",
        )

        print("Fetching artist list...")
        artists = get_artist_links(page)
        print(f"Found {len(artists)} artists")

        with open("songs.csv", "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["title", "artist", "url", "page"])
            writer.writeheader()

            output_dir = Path("downloads")

            for artist in artists:
               print(f"  Scraping: {artist['name']}")
               songs = get_songs(page, artist["url"])
               if not songs:
                  continue

               print(f"    -> {len(songs)} songs")
               for song in songs:
                  writer.writerow({**song, "page": artist["url"]})
                  downloaded = download_song(page, song, output_dir)
                  status = "OK" if downloaded else "skip"
                  print(f"    [{status}] {song['title']}")
                  time.sleep(0.5)

        browser.close()
        print("Done -> songs.csv")


if __name__ == "__main__":
    scrape()