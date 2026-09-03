# UzzUTV

UzzUTV is a Netflix-style streaming platform built with Django that lets you discover, search, and watch movies and TV series. All content data is pulled live from **The Movie Database (TMDB) API**, with a responsive, mobile-friendly UI inspired by modern streaming apps. Accounts are powered by **Supabase**, giving you watchlist, Continue Watching, ratings, reviews, public profiles, and Watch Parties.

---

## Features

### Browse & Discover
- Trending, popular, and top-rated movies and TV shows
- Genre rows (Action, Romance, Comedy, Anime) with a mixed movie + TV feed
- Top 10 row and animated hero banners with movie/TV logos
- Landing-page genre cards that jump straight into a random title from that genre

### Genre Categories
- Dedicated category pages at `/category/<slug>/` for Action, Romance, Comedy, Animation, Thriller, Drama, Horror, Sci-Fi — plus Popular and Top Rated
- Each page mixes movies and TV shows in one balanced feed
- Paginated browsing (24 titles per page)

### Details & Cast
- Dedicated detail pages with full metadata and a hero banner using the official title logo
- Top Cast row with profile photos
- "More Like This" recommendations row
- Restyled Ratings & Reviews section matching the site theme

### Watch
- Episode streaming for TV series with season/episode navigation
- Movie playback pages
- Works on mobile and desktop

### Aniuzu Anime
- AniList-powered anime discovery, metadata, detail pages, watchlist, and episode navigation
- Anime watch route: `/aniuzu/anime/<anilist_id>/watch/<episode>/`
- Playback is limited to the documented AniLink and TryEmbed iframe providers
- SUB/DUB audio selection and AniLink/TryEmbed server switching preserve the current episode
- Responsive desktop two-column player/episode layout with independently scrollable episode lists
- Episode search/windowing keeps long-running anime usable
- Authenticated Continue Watching cards show anime, season, episode, progress, server, and variant
- Detail pages switch the Watch action to Resume when anime progress exists
- Aniuzu navigation includes Home, Genres, Seasons, Studios, Collections, Watchlist, and Search; Schedule, Top, and Upcoming pages are not part of the current product
- Responsive Aniuzu navigation collapses into an accessible menu across desktop, tablet, and mobile viewports

### Search
- Instant search across movies and TV shows

### Accounts (Supabase)
- Sign up / sign in with client-side field validation, live username availability checks, and friendly API error messages
- Watchlist, Continue Watching, ratings, and comments synced across devices
- UzzUTV and Aniuzu share one Supabase Auth session
- Context-aware login redirects preserve the originating application
- Forgot-password and password-reset flows use Supabase Auth recovery sessions

### Ratings & Reviews
- Star-rate any movie or TV show on its detail page
- Rating summary with average score and a 5-star distribution bar chart
- Comment/review on detail pages, with paginated comment feeds and author star ratings

### Watch Party
- Create or join watch parties at `/party/`
- Synchronized playback rooms at `/party/<room_code>/` powered by Supabase Realtime
- One-to-one host/guest video calling with Accept, Decline, Cancel, timeout, reconnect, camera, microphone, minimize, and End Call controls
- Desktop Expand mode turns the call into a full-page view with the remote video as the main stage and a small self-preview in the bottom-right
- The UzzUTV player-wrapper fullscreen control keeps the VidFast movie and call overlay visible together

### Watchlist
- Save favorites to watch later

### Profiles
- Personal profile page with your rated titles, watchlist, and recent comments
- Public, shareable profile pages at `/profile/<user_id>/`
- Dedicated `/rated/` page listing all your ratings

### Continue Watching
- Picks up where you left off in movies and TV episodes, across devices
- Aniuzu history is stored separately in `aniuzu_continue_watching`
- One Continue Watching row/card is maintained per user and anime; it is updated with the latest episode watched
- Aniuzu playback state stores AniList ID, episode, server, variant, position, duration, and progress percentage
- Progress writes are debounced/upserted and completed episodes are removed
- Row Level Security restricts Aniuzu history to the owning authenticated user

### SEO
- Dynamic `robots.txt` and `sitemap.xml`

### Performance
- Database-backed response caching (TMDB calls cached for hours)
- GZip compression middleware
- Lazy-loaded images for faster page loads

---

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Backend    | Python, Django 5.2.16              |
| Frontend   | HTML5, CSS3, Bootstrap 5, JavaScript |
| Data       | TMDB API (movies/TV metadata)       |
| Auth/Data  | Supabase (auth, watchlist, ratings, comments, profiles, realtime) |
| Database   | SQLite (Django)                     |
| Caching    | Django DatabaseCache                |
| Deploy     | PythonAnywhere (see `settings.py`)  |

---

## Getting Started

### Prerequisites
- Python 3.10+
- A free [TMDB API key](https://www.themoviedb.org/documentation/api)
- A Supabase project (optional, for auth/watchlist)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ujjwaluzu/uzzutv.git
cd uzzutv

# 2. Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # macOS/Linux

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set up environment variables (see below)
# 5. Run migrations and cache table
python manage.py migrate
python manage.py createcachetable

# 6. Start the development server
python manage.py runserver
```

### Environment Variables

Create a `.env` file in the project root:

```env
TMDB_KEY="your_tmdb_api_key"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_KEY="your_supabase_key"

DJANGO_SECRET_KEY="a_long_random_secret"
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=*

SECURE_SSL_REDIRECT=False
SESSION_COOKIE_SECURE=False
CSRF_COOKIE_SECURE=False
```

### Supabase setup

Run [`sql/aniuzu_tables.sql`](sql/aniuzu_tables.sql) in the Supabase SQL editor. It creates the Aniuzu watchlist and `aniuzu_continue_watching` tables, indexes, constraints, and Row Level Security policies. Continue Watching uses one row per authenticated user/anime and updates that row with the latest episode, server, variant, and position. The SQL also migrates older per-episode data by retaining the most recently updated row for each user/anime. Policies allow each authenticated user to select, insert, update, and delete only their own rows.

Run [`sql/watch_parties.sql`](sql/watch_parties.sql) to create the Watch Party tables, indexes, and Row Level Security policies for synchronized playback rooms.

Add the reset callback URL for every environment to Supabase Auth URL Configuration. The application builds this from the current origin as `/auth/reset-password/`, for example `http://127.0.0.1:8000/auth/reset-password/` during local development.

---

## Project Structure

```
uzzutv/
├── manage.py
├── requirements.txt
├── db.sqlite3
├── .env
├── sql/                   # Supabase SQL setup scripts
│   ├── aniuzu_tables.sql  # Aniuzu tables, indexes, RLS
│   └── watch_parties.sql  # Watch Party tables, indexes, RLS
├── stream/                # Django project settings
│   ├── settings.py        # env-based config, caching, gzip
│   ├── urls.py
│   └── wsgi.py / asgi.py
└── uzzutv/                # Main app
    ├── views.py           # All views + TMDB integration
    ├── urls.py            # Route table
    ├── supabase_client.py # Supabase client
    ├── templates/uzzutv/  # HTML templates
    └── static/            # CSS/JS assets
```

### Routes

| Route                     | Description                          |
|---------------------------|--------------------------------------|
| `/`                       | Landing page                         |
| `/home/`                  | Main browse page (hero + genre rows) |
| `/movie/` `/tv/`          | Movies / TV shows                    |
| `/category/<slug>/`       | Category page (mixed movies + TV, paginated): `action`, `romance`, `comedy`, `animation`, `thriller`, `drama`, `horror`, `scifi`, `popular`, `top_rated` |
| `/<type>/<id>/`           | Detail page (cast, recommendations, rate & comment) |
| `/movie/<id>/watch/`      | Movie player                         |
| `/tv/<id>/watch/`         | TV player (season/episode select)    |
| `/aniuzu/`                 | AniList anime home                   |
| `/aniuzu/anime/<id>/`      | Anime detail page                    |
| `/aniuzu/anime/<id>/watch/<episode>/` | Aniuzu anime player       |
| `/aniuzu/watchlist/`       | Aniuzu watchlist                     |
| `/aniuzu/search/`          | AniList anime search                 |
| `/aniuzu/continue-metadata/` | Metadata for Continue Watching cards |
| `/aniuzu/genres/`          | Anime genre list                     |
| `/aniuzu/genres/<genre>/`  | Anime genre browse page              |
| `/aniuzu/seasons/`         | Anime seasons browse page            |
| `/aniuzu/studios/`         | Anime studios list                   |
| `/aniuzu/studios/<name>/`  | Anime studio browse page             |
| `/aniuzu/collections/`     | Anime collections list               |
| `/aniuzu/collections/<slug>/` | Anime collection browse page       |
| `/search/`                | Search                               |
| `/watchlist/`             | Your saved titles                    |
| `/rated/`                 | Your ratings (with `/rated/<user_id>/` public view) |
| `/party/`                 | Watch Party dashboard (create/join)  |
| `/party/<room_code>/`     | Watch Party room with synchronized playback and video-call controls |
| `/auth/`                  | Sign in / sign up                    |
| `/auth/forgot-password/`  | Request a Supabase password reset    |
| `/auth/reset-password/`   | Complete a Supabase password reset  |
| `/profile/`               | Your profile (ratings, watchlist, comments) |
| `/profile/<user_id>/`     | Public profile                       |
| `/media-info/<type>/<id>/`| Media metadata JSON (used by profile pages) |
| `/terms/` `/dmca/`        | Legal pages                          |
| `/robots.txt` `/sitemap.xml` | SEO endpoints                     |

---

## Deployment (PythonAnywhere)

The project is configured for PythonAnywhere:

- `STATIC_ROOT` is set to a server path (update in `settings.py` if needed)
- Collect static files before deploying:
  ```bash
  python manage.py collectstatic
  ```
- In production, set `DJANGO_DEBUG=False` and `DJANGO_ALLOWED_HOSTS` to your domain, and enable the `SECURE_*` flags for HTTPS.

---

## Future Improvements

- Personalized recommendations
- Better streaming player
- Enhanced episode progress syncing
- Notifications for new episodes
- Progressive Web App (PWA)

---

## Disclaimer

This project was created for educational and learning purposes. Users are responsible for ensuring that any content streamed through the platform complies with applicable copyright laws and licensing requirements.

---

## Author

**Ujjwal Baunthiyal**

---

## License

This project is licensed under the MIT License.
