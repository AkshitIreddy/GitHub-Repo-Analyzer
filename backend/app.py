import os
import requests
import re
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

GITHUB_API_URL = "https://api.github.com/repos/"
GITHUB_API_HEADERS = {"Accept": "application/vnd.github.v3+json"}

@app.route('/api/analyze', methods=['POST'])
def analyze_repo():
    data = request.get_json()
    repo_url = data.get('repo_url')
    if not repo_url or 'github.com' not in repo_url:
        return jsonify({'error': 'Invalid GitHub repository URL.'}), 400
    try:
        owner_repo = repo_url.rstrip('/').split('github.com/')[-1]
        meta_url = GITHUB_API_URL + owner_repo
        contrib_url = meta_url + '/contributors'
        commits_url = meta_url + '/commits'
        readme_url = meta_url + '/readme'
        pr_url = meta_url + '/pulls'
        languages_url = meta_url + '/languages'
        topics_url = meta_url + '/topics'

        meta_resp = requests.get(meta_url, headers=GITHUB_API_HEADERS)
        contrib_resp = requests.get(contrib_url, headers=GITHUB_API_HEADERS, params={'per_page': 100})
        commits_resp = requests.get(commits_url, headers=GITHUB_API_HEADERS, params={'per_page': 100})
        readme_resp = requests.get(readme_url, headers=GITHUB_API_HEADERS)
        pr_resp = requests.get(pr_url, headers=GITHUB_API_HEADERS, params={'state': 'open'})
        lang_resp = requests.get(languages_url, headers=GITHUB_API_HEADERS)
        topics_resp = requests.get(topics_url, headers={**GITHUB_API_HEADERS, 'Accept': 'application/vnd.github.mercy-preview+json'})

        if meta_resp.status_code == 403 or contrib_resp.status_code == 403 or commits_resp.status_code == 403 or readme_resp.status_code == 403 or pr_resp.status_code == 403 or lang_resp.status_code == 403 or topics_resp.status_code == 403:
            return jsonify({'error': 'GitHub API rate limit exceeded.'}), 429
        if meta_resp.status_code != 200:
            return jsonify({'error': 'Failed to fetch repository metadata.'}), 400

        meta = meta_resp.json()
        contributors = contrib_resp.json() if contrib_resp.status_code == 200 else []
        commits = commits_resp.json() if commits_resp.status_code == 200 else []
        open_prs = pr_resp.json() if pr_resp.status_code == 200 else []
        languages = lang_resp.json() if lang_resp.status_code == 200 else {}
        topics = topics_resp.json().get('names', []) if topics_resp.status_code == 200 else []

        # Calculate commit frequency and recent activity
        commit_dates = [c['commit']['author']['date'][:10] for c in commits if 'commit' in c and 'author' in c['commit']]
        freq = {}
        for date in commit_dates:
            freq[date] = freq.get(date, 0) + 1
        from datetime import datetime, timedelta
        today = datetime.utcnow().date()
        last_week = today - timedelta(days=7)
        last_month = today - timedelta(days=30)
        commits_last_week = sum(1 for d in commit_dates if datetime.strptime(d, "%Y-%m-%d").date() >= last_week)
        commits_last_month = sum(1 for d in commit_dates if datetime.strptime(d, "%Y-%m-%d").date() >= last_month)

        # Top contributors by commit count (from contributors API)
        top_contributors = sorted(contributors, key=lambda x: x.get('contributions', 0), reverse=True)[:3]
        top_contributors = [
            {
                'login': c.get('login'),
                'avatar_url': c.get('avatar_url'),
                'contributions': c.get('contributions'),
                'html_url': c.get('html_url')
            }
            for c in top_contributors
        ]

        # License
        license_name = meta.get('license', {}).get('name') if meta.get('license') else None
        # Last updated
        last_updated = meta.get('pushed_at')

        # README analysis
        readme_analysis = {
            'matches': [],
            'images': [],
            'main_image': None
        }
        if readme_resp.status_code == 200:
            readme_data = readme_resp.json()
            import base64
            content = base64.b64decode(readme_data.get('content', '')).decode('utf-8', errors='ignore')
            lines = content.splitlines()
            keywords = ['demo', 'tutorial', 'explanation', 'guide', 'walkthrough', 'example']
            url_pattern = re.compile(r'(https?://[^\s)]+)', re.IGNORECASE)
            img_pattern = re.compile(r'!\[.*?\]\((.*?)\)', re.IGNORECASE)
            used_lines = set()
            # Find images (for main image)
            for line in lines:
                for img_url in img_pattern.findall(line):
                    if not img_url.startswith('http'):
                        img_url = f'https://raw.githubusercontent.com/{owner_repo}/master/{img_url.lstrip("./")}'
                    readme_analysis['images'].append(img_url)
            if readme_analysis['images']:
                readme_analysis['main_image'] = readme_analysis['images'][0]
            # Find keyword+link lines
            i = 0
            while i < len(lines):
                line = lines[i]
                lcline = line.lower()
                has_keyword = any(kw in lcline for kw in keywords)
                links = url_pattern.findall(line)
                # Exclude github links from mentions
                links = [url for url in links if 'github' not in url.lower()]
                if has_keyword and links:
                    readme_analysis['matches'].append({
                        'urls': links
                    })
                    used_lines.add(i)
                elif has_keyword and not links and i+1 < len(lines):
                    next_links = url_pattern.findall(lines[i+1])
                    next_links = [url for url in next_links if 'github' not in url.lower()]
                    if next_links:
                        readme_analysis['matches'].append({
                            'urls': next_links
                        })
                        used_lines.add(i)
                        used_lines.add(i+1)
                        i += 1
                i += 1

            # Extract best description section from README
            best_section = None
            best_section_wordcount = 0
            best_section_title = None
            section_titles = ['introduction', 'overview', 'demo', 'about', 'description', 'background', 'project']
            section_re = re.compile(r'^#+\s*(.+)', re.IGNORECASE)
            sections = []
            curr_title = None
            curr_lines = []
            for line in lines:
                m = section_re.match(line)
                if m:
                    # Save previous section
                    if curr_title and curr_lines:
                        sections.append((curr_title, curr_lines))
                    curr_title = m.group(1).strip().lower()
                    curr_lines = []
                elif curr_title:
                    curr_lines.append(line)
            if curr_title and curr_lines:
                sections.append((curr_title, curr_lines))
            for title, sect_lines in sections:
                if any(key in title for key in section_titles):
                    wordcount = sum(len(l.split()) for l in sect_lines)
                    if wordcount > best_section_wordcount:
                        best_section = '\n'.join(sect_lines).strip()
                        best_section_wordcount = wordcount
                        best_section_title = title

        return jsonify({
            'name': meta.get('full_name'),
            'description': meta.get('description'),
            'stars': meta.get('stargazers_count'),
            'forks': meta.get('forks_count'),
            'open_issues': meta.get('open_issues_count'),
            'contributors': contributors,
            'commit_frequency': freq,
            'total_commits': len(commits),
            'readme_analysis': readme_analysis,
            'commits_last_week': commits_last_week,
            'commits_last_month': commits_last_month,
            'top_contributors': top_contributors,
            'languages': languages,
            'license': license_name,
            'last_updated': last_updated,
            'open_prs': len(open_prs),
            'topics': topics,
            'best_section': {
                'title': best_section_title,
                'content': best_section
            } if best_section else None
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/')
def home():
    return 'GitHub Repo Analyzer API is running.'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
