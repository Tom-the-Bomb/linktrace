
CREATE TABLE IF NOT EXISTS users (
    id BINARY(16) PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1 row / job: url + status
CREATE TABLE IF NOT EXISTS jobs (
    id BINARY(16) PRIMARY KEY,
    user_id BINARY(16) NULL,
    url TEXT NOT NULL,
    status ENUM(
        'pending',
        'crawling',
        'complete',
        'failed',
        'stopped'
    ) DEFAULT 'pending',
    total_pages INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_id (user_id)
);

-- 1 row per crawled page: rot or not rot
CREATE TABLE IF NOT EXISTS pages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    job_id BINARY(16) NOT NULL,
    url TEXT NOT NULL,
    status_code INT,
    response_time INT, -- milliseconds
    error_type VARCHAR(50),
    is_alive BOOLEAN,
    depth INT DEFAULT 0,
    retry_count INT DEFAULT 0,
    redirect_chain JSON,
    archive_url TEXT,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (job_id) REFERENCES jobs(id),
    INDEX idx_job_id (job_id),
    INDEX idx_is_alive (is_alive)
);

-- 1 row / healthy page: SEO breakdown
CREATE TABLE IF NOT EXISTS seo_audits (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    job_id BINARY(16) NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    title_length INT DEFAULT 0,
    meta_description TEXT,
    meta_description_length INT DEFAULT 0,
    h1_count INT DEFAULT 0,
    h2_count INT DEFAULT 0,
    h3_count INT DEFAULT 0,
    h4_count INT DEFAULT 0,
    h5_count INT DEFAULT 0,
    h6_count INT DEFAULT 0,
    images_total INT DEFAULT 0,
    images_with_alt INT DEFAULT 0,
    images_with_dims INT DEFAULT 0,
    images_lazy_loaded INT DEFAULT 0,
    images_responsive INT DEFAULT 0,
    links_internal INT DEFAULT 0,
    links_external INT DEFAULT 0,
    links_nofollow INT DEFAULT 0,
    html_lang VARCHAR(20),
    canonical TEXT,
    og_tags JSON,
    twitter_tags JSON,
    jsonld_count INT DEFAULT 0,
    jsonld_types JSON,
    has_viewport BOOLEAN DEFAULT FALSE,
    noindex BOOLEAN DEFAULT FALSE,
    top_keywords JSON,
    primary_keyword VARCHAR(100),
    keyword_in_title BOOLEAN DEFAULT FALSE,
    keyword_in_h1 BOOLEAN DEFAULT FALSE,
    keyword_in_url BOOLEAN DEFAULT FALSE,
    issues JSON,
    score INT DEFAULT 0,
    audited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (job_id) REFERENCES jobs(id),
    INDEX idx_job_id (job_id),
    INDEX idx_score (score)
);

-- 1 row / site: site-wide/global audits
CREATE TABLE IF NOT EXISTS site_audits (
    job_id BINARY(16) PRIMARY KEY,
    robots_found BOOLEAN DEFAULT FALSE,
    robots_disallow_all BOOLEAN DEFAULT FALSE,
    crawl_delay INT DEFAULT 0,
    sitemap_found BOOLEAN DEFAULT FALSE,
    sitemap_url TEXT,
    sitemap_url_count INT DEFAULT 0,
    sitemap_urls JSON,
    is_https BOOLEAN DEFAULT FALSE,
    https_redirect BOOLEAN DEFAULT FALSE,
    cert_valid BOOLEAN DEFAULT FALSE,
    www_canonical VARCHAR(20) DEFAULT 'inconsistent',
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- 1 row per discovered internal link: source page -> target page; powers the graph view
CREATE TABLE IF NOT EXISTS links (
    job_id BINARY(16) NOT NULL,
    source_url TEXT NOT NULL,
    target_url TEXT NOT NULL,
    -- short hashes let us index TEXT columns cheaply for de-dupe
    source_hash CHAR(40) AS (SHA1(source_url)) STORED,
    target_hash CHAR(40) AS (SHA1(target_url)) STORED,

    PRIMARY KEY (job_id, source_hash, target_hash),
    FOREIGN KEY (job_id) REFERENCES jobs(id),
    INDEX idx_job (job_id)
);

-- 1 row per (job, URL category): rolled-up rot% and avg SEO score, rewritten by the aggregator
CREATE TABLE IF NOT EXISTS category_reports (
    job_id BINARY(16) NOT NULL,
    category VARCHAR(255) NOT NULL,
    total_pages INT DEFAULT 0,
    rotten_pages INT DEFAULT 0,
    avg_seo_score INT DEFAULT 0,
    pattern VARCHAR(32),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (job_id, category),
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);
