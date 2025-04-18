import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('http://localhost:5000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: repoUrl })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unknown error');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- LinkPreview component using Microlink ---
  function LinkPreview({ url, onHasImage }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(false);
    useEffect(() => {
      let cancelled = false;
      setData(null); setError(false);
      fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`)
        .then(r => r.json())
        .then(json => {
          if (cancelled) return;
          if (json.status === 'success' && json.data.image?.url) {
            setData(json.data);
            if (onHasImage) onHasImage(url);
          } else {
            setError(true);
          }
        })
        .catch(() => setError(true));
      return () => { cancelled = true; };
    }, [url, onHasImage]);
    if (error) return null;
    if (!data) return <div style={{ width: 320, height: 180, background: '#f3f3f3', borderRadius: 8 }} />;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: 320, height: 180, borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.07)' }}>
        <img src={data.image.url} alt={data.title || url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </a>
    );
  }

  function getDomain(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  // --- DemoLinksSection: handles deduplication and fallback ---
  function DemoLinksSection({ matches }) {
    const [previewed, setPreviewed] = useState([]);
    // Track which links have a preview image
    const handleHasImage = url => setPreviewed(prev => prev.includes(url) ? prev : [...prev, url]);
    // Flatten all links
    const allLinks = matches.flatMap(m => m.urls);
    // Unique links
    const uniqueLinks = Array.from(new Set(allLinks));
    return (
      <>
        {/* Row with image previews (Microlink) */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 16 }}>
          {uniqueLinks.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <LinkPreview url={url} onHasImage={handleHasImage} />
            </a>
          ))}
        </div>
        {/* Row with links without previews (fallback) */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {uniqueLinks.filter(url => !previewed.includes(url)).map((url, i) => (
            <a key={'np-' + i} href={url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 16px', background: '#e0e0e0', borderRadius: 6, color: '#333', fontWeight: 500, textDecoration: 'none', display: 'inline-block' }}>
              {getDomain(url)}
            </a>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="frosty-bg" style={{flexDirection:'column',alignItems:'center'}}>
      <div style={{ width: '100%', maxWidth: 1080, margin: '0 auto 32px auto', position: 'relative', zIndex: 2 }}>
        <form onSubmit={handleAnalyze} style={{ display:'flex', gap:10, justifyContent:'center', marginBottom: 36 }}>
          <input
            type="text"
            placeholder="Enter GitHub repo URL (e.g. https://github.com/user/repo)"
            value={repoUrl}
            onChange={e => setRepoUrl(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>Analyze</button>
        </form>
        {loading && <p style={{textAlign:'center'}}>Analyzing repository...</p>}
        {error && <p className="error" style={{textAlign:'center'}}>Error: {error}</p>}
      </div>
      {result && (
        <div className="grid">
          {/* (1,1) Title + Image Card */}
          <div className="card" style={{ gridColumn: 1, gridRow: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h2>{result.name}</h2>
            <div className="scrollable" style={{flex: 1, minHeight: 0, fontSize:15, color:'#2d2d2d', marginTop:8}}>
              {result.readme_analysis && result.readme_analysis.main_image && (
                <div style={{ background: '#ececec', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 0 16px 0', padding: '12px 0', borderRadius: 12 }}>
                  <img src={result.readme_analysis.main_image} alt="Project visual" style={{ maxWidth: '100%', maxHeight: 180, objectFit: 'contain', display: 'block' }} />
                </div>
              )}
              <p>{result.description}</p>
            </div>
          </div>

          {/* (2,1) Commit History Card */}
          <div className="card" style={{ gridColumn: 1, gridRow: 2, height: '100%', marginTop: 0, display: 'flex', flexDirection: 'column' }}>
            <h3>Recent Commit History</h3>
            <div className="scrollable" style={{paddingLeft: 0, margin: 0, flex: 1, minHeight: 0}}>
              <ul style={{paddingLeft: 0, margin: 0}}>
                {result.commit_frequency && Object.entries(result.commit_frequency).slice(0, 50).map(([date, count]) => (
                  <li key={date} style={{ padding: '4px 0', fontSize: 15, margin: 0 }}>
                    <b>{date}:</b> {count} commit(s)
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* (1,2) Repo Description Card */}
          <div className="card" style={{ gridColumn: 2, gridRow: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3>Repository Description</h3>
            {result.best_section ? (
              <div className="scrollable" style={{flex: 1, minHeight: 0}}>
                <h4 style={{margin:'8px 0'}}>{result.best_section.title && result.best_section.title.charAt(0).toUpperCase() + result.best_section.title.slice(1)}</h4>
                <div style={{whiteSpace:'pre-line', fontSize:15, color:'#2d2d2d'}}>{result.best_section.content}</div>
              </div>
            ) : <div className="scrollable" style={{flex: 1, minHeight: 0}}><p>{result.description}</p></div>}
          </div>

          {/* (2,2) Metrics Card */}
          <div className="card" style={{ gridColumn: 2, gridRow: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="scrollable" style={{flex: 1, minHeight: 0}}>
              <h3>Repository Metrics</h3>
              <ul style={{listStyle:'none',padding:0}}>
                <li><b>⭐ Stars:</b> {result.stars}</li>
                <li><b>🍴 Forks:</b> {result.forks}</li>
                <li><b>🐞 Open Issues:</b> {result.open_issues}</li>
                <li><b>👥 Contributors:</b> {result.contributors ? result.contributors.length : 0}</li>
                <li><b>License:</b> {result.license || 'N/A'}</li>
                <li><b>Languages:</b> {result.languages && Object.keys(result.languages).length > 0 ? Object.entries(result.languages).map(([lang, val], idx, arr) => lang + (idx < arr.length - 1 ? ', ' : '')) : 'N/A'}</li>
                <li><b>Last Updated:</b> {result.last_updated ? new Date(result.last_updated).toLocaleString() : 'N/A'}</li>
                <li><b>Open PRs:</b> {result.open_prs}</li>
                <li><b>Commits (last week):</b> {result.commits_last_week}</li>
                <li><b>Commits (last month):</b> {result.commits_last_month}</li>
                <li><b>Topics:</b> {result.topics && result.topics.length > 0 ? result.topics.join(', ') : 'N/A'}</li>
              </ul>
              {result.top_contributors && result.top_contributors.length > 0 && (
                <div style={{marginTop:8}}>
                  <b>Top Contributors:</b>
                  <div style={{display:'flex',gap:16,marginTop:6,flexWrap:'wrap'}}>
                    {result.top_contributors.map(c => (
                      <a key={c.login} href={c.html_url} target="_blank" rel="noopener noreferrer" style={{display:'flex',alignItems:'center',textDecoration:'none',color:'#333',background:'#f6f8fa',borderRadius:6,padding:'2px 8px',marginBottom:6}}>
                        <img src={c.avatar_url} alt={c.login} style={{width:28,height:28,borderRadius:'50%',marginRight:8}} />
                        <span>{c.login} ({c.contributions})</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* (1,3) + (2,3): Demo Card (spans two rows) */}
          <div className="card" style={{ gridColumn: 3, gridRow: '1 / span 2', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3>Demo Video</h3>
            <div className="scrollable" style={{flex: 1, minHeight: 0, display:'flex',flexDirection:'column',gap:18}}>
              {result.readme_analysis && result.readme_analysis.matches.length > 0 ? (
                <DemoLinksSection matches={result.readme_analysis.matches} />
              ) : <p>No demo/tutorial/explanation links found in README.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
