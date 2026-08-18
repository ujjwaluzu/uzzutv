# UzzUTV

UzzUTV is a Netflix-style streaming platform built with Django that lets you discover, search, and watch movies and TV series. All content data is pulled live from **The Movie Database (TMDB) API**, with a responsive, mobile-friendly UI inspired by modern streaming apps. Accounts are powered by **Supabase**, giving you watchlist, Continue Watching, ratings, reviews, and public profiles.

---

## Features

### Browse & Discover
- Trending, popular, and top-rated movies and TV shows
- Genre rows (Action, Romance, Comedy, Anime) with a mixed movie + TV feed
- Top 10 row and animated hero banners with movie/TV logos

### Details & Cast
- Dedicated detail pages with full metadata, cast list, and recommendations

### Watch
- Episode streaming for TV series with season/episode navigation
- Movie playback pages
- Works on mobile and desktop

### Search
- Instant search across movies and TV shows

### Accounts (Supabase)
- Sign up / sign in with client-side field validation, live username availability checks, and friendly API error messages
- Watchlist, Continue Watching, ratings, and comments synced across devices

### Ratings & Reviews
- Star-rating any movie or TV show on its detail page
- Comment/review on detail pages, with paginated comment feeds

### Watchlist
- Save favorites to watch later

### Profiles
- Personal profile page with your rated titles, watchlist, and recent comments
- Public, shareable profile pages at `/profile/<user_id>/`
- Dedicated `/rated/` page listing all your ratings

### Continue Watching
- Picks up where you left off in movies and TV episodes, across devices

### Performance
- Database-backed response caching (TMDB calls cached for hours)
- GZip compression middleware
- Lazy-loaded images for faster page loads

---

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Backend    | Python, Django 4.2                  |
| Frontend   | HTML5, CSS3, Bootstrap 5, JavaScript |
| Data       | TMDB API (movies/TV metadata)       |
| Auth/Data  | Supabase (auth, watchlist, ratings, comments, profiles) |
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
pip install django python-dotenv requests supabase

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

---

## Project Structure

```
uzzutv/
├── manage.py
├── db.sqlite3
├── .env
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
| `/<type>/<id>/`           | Detail page (cast, recommendations, rate & comment) |
| `/movie/<id>/watch/`      | Movie player                         |
| `/tv/<id>/watch/`         | TV player (season/episode select)    |
| `/search/`                | Search                               |
| `/watchlist/`             | Your saved titles                    |
| `/rated/`                 | Your ratings (with `/rated/<user_id>/` public view) |
| `/auth/`                  | Sign in / sign up                    |
| `/profile/`               | Your profile (ratings, watchlist, comments) |
| `/profile/<user_id>/`     | Public profile                       |
| `/media-info/<type>/<id>/`| Media metadata JSON (used by profile pages) |
| `/terms/` `/dmca/`        | Legal pages                          |

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

- Watch Together functionality
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