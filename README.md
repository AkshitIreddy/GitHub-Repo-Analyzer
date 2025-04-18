# GitHub Repo Analyzer

<img width="1280" alt="image" src="https://github.com/user-attachments/assets/46c12f5f-a54d-4f78-bf60-06844bc959e1" />

A tool to analyze public GitHub repositories and present insights using the GitHub API.

## Features
- Input a GitHub repo link
- Fetch and display repo metadata (name, stars, forks, etc.)
- Display contributor and commit activity data
- Handles rate-limiting and failed API calls gracefully
- Metrics on commit frequencies

## Running with Docker

```
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

