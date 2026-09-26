import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  House,
  Images,
  ChartNoAxesCombined,
  BookOpen,
  Settings,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Upload,
  Camera,
  Video,
  Check,
  ChevronRight,
  Instagram,
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  X,
  Download,
  Copy,
  Leaf,
  Play,
  LoaderCircle,
  CheckCheck,
  Image as ImageIcon,
  ChevronLeft,
} from "lucide-react";
import "./style.css";
const nav = [
  ["Today", House],
  ["Content", Images],
  ["Results", ChartNoAxesCombined],
  ["How to use", BookOpen],
];
const istanbulDay = (d) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(d));
const number = (n) => (n == null ? "—" : new Intl.NumberFormat("en").format(n));
const api = async (url, body, method = body ? "POST" : "GET") => {
  const res = await fetch("/api" + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await res.json();
  if (!res.ok) {
    if (res.status === 401 && url !== "/login")
      window.dispatchEvent(new Event("crumb-locked"));
    throw new Error(d.error || "Please try again.");
  }
  return d;
};
function Media({ asset, controls = false, ...props }) {
  return asset.type === "video" && !asset.demo ? (
    <video
      src={asset.url}
      poster={asset.thumbnail || undefined}
      controls={controls}
      playsInline
      preload="metadata"
      {...props}
    />
  ) : (
    <img src={asset.thumbnail || asset.url} alt={asset.title} {...props} />
  );
}
function Badge({ quality }) {
  return (
    <span className={"badge " + quality.toLowerCase()}>
      <span />
      {quality}
    </span>
  );
}
function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          aria-label="Close dialog"
          className="icon-button"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
async function videoFrame(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video"),
      url = URL.createObjectURL(file);
    let done = false;
    const finish = (blob) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(blob);
    };
    const timer = setTimeout(() => finish(null), 7000);
    video.preload = "auto";
    video.muted = true;
    video.onloadeddata = () => {
      video.currentTime = Math.min(
        1,
        Number.isFinite(video.duration) ? video.duration / 3 : 0,
      );
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(1200, video.videoWidth);
        canvas.height = (canvas.width * video.videoHeight) / video.videoWidth;
        canvas
          .getContext("2d")
          .drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(finish, "image/jpeg", 0.85);
      } catch {
        finish(null);
      }
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}
function App({ onLogout }) {
  const [data, setData] = useState(null),
    [page, setPage] = useState(
      decodeURIComponent(location.hash.slice(1)) || "Today",
    ),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("All"),
    [selected, setSelected] = useState([]),
    [queues, setQueues] = useState([]),
    [library, setLibrary] = useState("Media"),
    [drag, setDrag] = useState(false);
  const input = useRef(),
    uploading = useRef(false);
  const reload = async () => {
    const d = await api("/state");
    setData(d);
    return d;
  };
  useEffect(() => {
    const status = new URLSearchParams(location.search).get("instagram");
    const messages = {
      connected: "Instagram connected with read-only access.",
      cancelled:
        "Instagram connection cancelled. You can try again whenever you like.",
      invalid: "The connection link expired. Please connect Instagram again.",
      failed:
        "Instagram sign-in could not finish. Check that this Professional account is allowed to test the Meta app, then reconnect.",
    };
    if (status) {
      history.replaceState(null, "", location.pathname + location.hash);
      setToast(messages[status] || "Please reconnect Instagram.");
    }
    reload()
      .then(async () => {
        if (status === "connected") {
          try {
            await api("/instagram/sync", {});
            await reload();
          } catch (e) {
            setError(e.message);
          }
        }
      })
      .catch((e) => setError(e.message));
    const change = () =>
      setPage(decodeURIComponent(location.hash.slice(1)) || "Today");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const go = (p) => {
    location.hash = encodeURIComponent(p);
    setPage(p);
    window.scrollTo(0, 0);
  };
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const create = (ids) =>
    run(async () => {
      setModal({ type: "generating" });
      try {
        const post = await api("/posts", { assetIds: ids });
        await reload();
        setModal({ type: "post", post });
        setSelected([]);
      } catch (e) {
        setModal(null);
        throw e;
      }
    });
  const uploadFiles = async (files) => {
    if (uploading.current) {
      setToast("Your current upload is still finishing.");
      return;
    }
    if (!files.length) return;
    uploading.current = true;
    go("Content");
    setLibrary("Media");
    setFilter("All");
    const batch = Array.from(files).map((file, id) => ({
      file,
      id,
      name: file.name,
      progress: 0,
      status: "Waiting",
    }));
    setQueues(batch);
    const update = (id, patch) =>
      setQueues((q) => q.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    for (const item of batch) {
      if (item.file.size > 50 * 1024 * 1024) {
        update(item.id, {
          status: "error",
          message: "This file is over 50 MB.",
        });
        continue;
      }
      try {
        update(item.id, { status: "Preparing" });
        const frame = item.file.type.startsWith("video/")
          ? await videoFrame(item.file)
          : null;
        if (data.providers.storage === "supabase") {
          let ticket;
          try {
            ticket = await api("/uploads", {
              name: item.file.name,
              mime: item.file.type,
              size: item.file.size,
              frame: !!frame,
            });
            await directUpload(ticket.url, item.file, (p) =>
              update(item.id, { progress: p, status: "Uploading" }),
            );
            if (frame) await directUpload(ticket.frameUrl, frame, () => {});
            update(item.id, { status: "Analyzing", progress: 100 });
            await api(`/uploads/${ticket.id}/complete`, {});
          } catch (e) {
            if (ticket)
              await api(`/uploads/${ticket.id}`, null, "DELETE").catch(
                () => {},
              );
            throw e;
          }
        } else {
          const form = new FormData();
          form.append("file", item.file);
          if (frame) form.append("frame", frame, "frame.jpg");
          await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/assets");
            xhr.timeout = 120000;
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable)
                update(item.id, {
                  progress: Math.round((e.loaded / e.total) * 100),
                  status: e.loaded === e.total ? "Analyzing" : "Uploading",
                });
            };
            xhr.onload = () => {
              try {
                const d = JSON.parse(xhr.responseText);
                if (xhr.status >= 400) reject(new Error(d.error));
                else resolve(d);
              } catch {
                reject(new Error("Upload failed. Try this file again."));
              }
            };
            xhr.onerror = () =>
              reject(new Error("Connection lost. Try this file again."));
            xhr.ontimeout = () =>
              reject(new Error("Upload timed out. Try this file again."));
            xhr.send(form);
          });
        }
        update(item.id, { status: "Done", progress: 100 });
        await reload();
      } catch (e) {
        update(item.id, { status: "error", message: e.message });
      }
    }
    uploading.current = false;
    if (input.current) input.current.value = "";
    setQueues((q) => [...q]);
  };
  if (!data)
    return (
      <div className="loading-page">
        <h1>
          crumb<span>✳</span>
        </h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button onClick={() => reload().catch((e) => setError(e.message))}>
              Try again
            </button>
          </>
        ) : (
          <p>
            <LoaderCircle className="spin" /> Preparing your workspace…
          </p>
        )}
      </div>
    );
  const rec = data.recommendation,
    inv = data.inventory,
    assets = data.assets;
  const shown = assets.filter(
    (a) =>
      filter === "All" ||
      (filter === "Photos" && a.type === "photo") ||
      (filter === "Videos" && a.type === "video") ||
      (filter === "Unused" && !a.used) ||
      (filter === "Posted" && a.used),
  );
  const connectCard = () => (
    <div className="connection-card">
      <div className="connection-icon">
        <Instagram size={22} />
      </div>
      <div>
        <h3>
          {data.connection.connected
            ? `Instagram connected · @${data.connection.username}`
            : "A little better, together."}
        </h3>
        <p>
          {data.connection.connected
            ? "Read-only access · profile, posts and insights."
            : "Connect Instagram to learn what your customers love."}
        </p>
      </div>
      <button
        className="text-button"
        onClick={() => setModal({ type: "connect" })}
      >
        {data.connection.connected ? "Manage connection" : "Connect Instagram"}{" "}
        <ArrowUpRight size={16} />
      </button>
    </div>
  );
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#Today" aria-label="Crumb home">
          crumb<span>✳</span>
        </a>
        <div className="workspace">
          <div className="business-avatar">
            cg<span>·</span>
          </div>
          <div>
            <strong>{data.business.name}</strong>
            <small>Your little marketing studio</small>
          </div>
        </div>
        <nav aria-label="Main navigation">
          {nav.map(([name, Icon]) => (
            <a
              key={name}
              aria-label={name}
              href={"#" + encodeURIComponent(name)}
              aria-current={page === name ? "page" : undefined}
              className={page === name ? "active" : ""}
            >
              <Icon size={19} />
              {name}
              {name === "Content" && (
                <span className="nav-count">{assets.length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="note-flower">✳</div>
            <p>
              You make the good things.
              <br />
              We’ll help you share them.
            </p>
          </div>
          <a href="#Settings" aria-label="Settings" className="settings-link">
            <Settings size={18} /> Settings
          </a>
          <div className="business-location">
            <span className="online-dot" /> Made for your business{" "}
            <span>↗</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            YOUR WORKSPACE <ChevronRight size={13} /> <span>{page}</span>
          </div>
          <div className="topbar-right">
            <span className="language-dot" /> Creating in Turkish{" "}
            <div className="mini-avatar">CG</div>
          </div>
        </header>
        <main>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Today" && (
            <>
              <Heading
                eyebrow="A LITTLE DIRECTION FOR YOUR DAY"
                title="Good things deserve to be seen."
                text="Let’s turn what you’re making into something worth sharing."
                action={
                  <button
                    className="button secondary"
                    onClick={() => input.current.click()}
                  >
                    <Plus size={18} /> Add content
                  </button>
                }
              />
              <div className="inventory-strip">
                <div className="strip-icon">
                  <Images size={21} />
                </div>
                <p>
                  You have useful content for{" "}
                  <strong>{inv.useful} posts.</strong>
                  <span>One good shot is all it takes to get started.</span>
                </p>
                <button className="text-button" onClick={() => go("Content")}>
                  View your content <ArrowRight size={17} />
                </button>
              </div>
              <div className="section-heading">
                <h2>Your next little move</h2>
                <span>Made for {data.business.name}</span>
              </div>
              {rec.asset ? (
                <section className="recommended">
                  <div className="hero-media">
                    <Media asset={rec.asset} />
                    <span className="media-top-tag">
                      {rec.asset.type === "video" ? (
                        <Video size={14} />
                      ) : (
                        <ImageIcon size={14} />
                      )}{" "}
                      {rec.asset.demo ? "Sample · " : ""}
                      {rec.asset.type === "video" ? "Reel idea" : "Post idea"}
                    </span>
                    <button
                      className="play-button"
                      aria-label="Preview recommended content"
                      onClick={() =>
                        setModal({ type: "asset", asset: rec.asset })
                      }
                    >
                      <Play fill="currentColor" size={23} />
                    </button>
                    <div className="media-caption">
                      FROM YOUR CONTENT LIBRARY
                    </div>
                  </div>
                  <div className="hero-copy">
                    <div className="eyebrow">
                      <span className="online-dot" /> RECOMMENDED NEXT POST
                    </div>
                    <h2 lang="tr">{rec.asset.title}</h2>
                    <div className="pill-row">
                      <span>
                        {rec.asset.type === "video" ? "Reel" : "Feed post"}
                      </span>
                      <span>Instagram</span>
                      <span>Türkçe</span>
                    </div>
                    <p lang="tr">{rec.reason}</p>
                    <div className="reason-source">
                      {rec.source === "demo"
                        ? "Based on sample performance data"
                        : rec.source === "instagram"
                          ? "Based on your Instagram results"
                          : rec.source === "manual"
                            ? "Based on your recorded results"
                            : "Based on your available content"}
                    </div>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => create([rec.asset.id])}
                    >
                      Create this post <ArrowRight size={18} />
                    </button>
                    <small>
                      A thoughtful draft. Ready for your finishing touch.
                    </small>
                  </div>
                </section>
              ) : (
                <EmptyContent upload={() => input.current.click()} />
              )}
              <div className="idea-grid">
                <section className="idea-card">
                  <div className="eyebrow">
                    <Leaf size={17} /> A SEASONAL THOUGHT
                  </div>
                  <h3 lang="tr">{data.seasonal.title}</h3>
                  <p lang="tr">{data.seasonal.text}</p>
                  <span className="quiet-tag">For this season · Istanbul</span>
                </section>
                <section className="idea-card peach">
                  <div className="eyebrow">
                    <Camera size={17} /> CAPTURE NEXT
                  </div>
                  <h3 lang="tr">
                    {inv.low
                      ? "Biraz daha içerik çekelim."
                      : "Bir sonraki pastada, kameran hazır olsun."}
                  </h3>
                  <p lang="tr">{rec.capture}</p>
                  <button
                    className="text-button"
                    onClick={() => setModal({ type: "capture" })}
                  >
                    See your shot list <ArrowRight size={16} />
                  </button>
                </section>
              </div>
              {connectCard()}
              <div className="gentle-footer">
                Small steps. Good content. A little more time for baking.
              </div>
            </>
          )}
          {page === "Content" && (
            <>
              <Heading
                eyebrow="A HOME FOR EVERYTHING YOU MAKE"
                title="Your content, full of possibility."
                text="Add it all. We’ll help you find the good stuff."
              />
              <div className="content-counts">
                <span>
                  <strong>{inv.photos}</strong> unused photos
                </span>
                <span>
                  <strong>{inv.videos}</strong> unused videos
                </span>
                <span>
                  <strong>{inv.used}</strong> posted
                </span>
                <p lang="tr">{inv.text}</p>
              </div>
              <div
                className={"dropzone " + (drag ? "dragging" : "")}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  uploadFiles(e.dataTransfer.files);
                }}
              >
                <div className="upload-icon">
                  <Upload size={25} />
                </div>
                <h3>All your cake photos. All your little videos.</h3>
                <p>
                  Drop them here, or{" "}
                  <button
                    className="inline-link"
                    onClick={() => input.current.click()}
                  >
                    browse files
                  </button>
                </p>
                <small>
                  JPG, PNG, WebP, AVIF, MP4, MOV, WebM · Up to 50 MB each · Add
                  many at once
                </small>
              </div>
              {queues.length > 0 && (
                <section
                  className="upload-queue"
                  aria-label="Upload progress"
                  aria-live="polite"
                >
                  <div className="section-heading">
                    <h3>
                      {queues.filter((q) => q.status === "Done").length} of{" "}
                      {queues.length} files ready
                    </h3>
                    {!uploading.current && (
                      <button
                        className="text-button"
                        onClick={() => setQueues([])}
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                  {queues.map((q) => (
                    <div className="queue-row" key={q.id}>
                      <span>{q.name}</span>
                      <progress
                        aria-label={q.name}
                        max="100"
                        value={q.progress}
                      />
                      <small
                        className={q.status === "error" ? "error-text" : ""}
                      >
                        {q.status === "error" ? q.message : q.status}
                      </small>
                      {q.status === "error" && (
                        <button
                          className="text-button"
                          onClick={() => uploadFiles([q.file])}
                        >
                          Retry
                        </button>
                      )}
                      {q.status === "Done" && <Check size={16} />}
                    </div>
                  ))}
                </section>
              )}
              {inv.low && (
                <div className="low-banner">
                  <Camera size={22} />
                  <div>
                    <h3>I need more content</h3>
                    <p lang="tr">
                      İyi çekimlerin bitmek üzere. Bir sonraki pasta yapımında
                      üç kısa çekim yeterli.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setModal({ type: "capture" })}
                  >
                    Get a shot list <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <div className="library-toolbar">
                <div className="segmented">
                  {["Media", "Posts"].map((t) => (
                    <button
                      key={t}
                      className={library === t ? "selected" : ""}
                      onClick={() => setLibrary(t)}
                    >
                      {t}
                      {t === "Posts" ? " · " + data.posts.length : ""}
                    </button>
                  ))}
                </div>
                {library === "Media" && (
                  <div className="filters">
                    {["All", "Photos", "Videos", "Unused", "Posted"].map(
                      (t) => (
                        <button
                          key={t}
                          className={filter === t ? "selected" : ""}
                          onClick={() => setFilter(t)}
                        >
                          {t}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
              {library === "Media" ? (
                <>
                  <div className="library-helper">
                    <span>
                      {shown.length} items · Open a photo for feedback
                    </span>
                    <span>
                      {data.providers.ai === "openai"
                        ? "AI analysis enabled"
                        : "Local quality checks"}
                    </span>
                  </div>
                  {selected.length > 0 && (
                    <div className="selection-bar">
                      <span>{selected.length} selected</span>
                      <button
                        className="text-button"
                        onClick={() => setSelected([])}
                      >
                        Clear
                      </button>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => create(selected)}
                      >
                        Create post <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                  <div className="media-grid">
                    {shown.map((a) => (
                      <article
                        className={
                          "asset-card " +
                          (selected.includes(a.id) ? "is-selected" : "")
                        }
                        key={a.id}
                      >
                        <div className="asset-image">
                          <button
                            className="media-open"
                            onClick={() =>
                              setModal({ type: "asset", asset: a })
                            }
                            aria-label={"Open " + a.title}
                          >
                            <Media asset={a} />
                          </button>
                          <label className="select-box">
                            <input
                              type="checkbox"
                              aria-label={"Select " + a.title}
                              checked={selected.includes(a.id)}
                              disabled={
                                a.analysis.quality === "Skip" ||
                                (!selected.includes(a.id) &&
                                  selected.length >= 10)
                              }
                              onChange={(e) =>
                                setSelected((s) =>
                                  e.target.checked
                                    ? [...s, a.id]
                                    : s.filter((id) => id !== a.id),
                                )
                              }
                            />
                          </label>
                          <span className="type-indicator">
                            {a.type === "video" ? (
                              <Video size={15} />
                            ) : (
                              <ImageIcon size={15} />
                            )}
                          </span>
                          {a.used && (
                            <span className="used-tag">
                              <CheckCheck size={13} /> Posted
                            </span>
                          )}
                          {a.demo && <span className="sample-tag">Sample</span>}
                        </div>
                        <div className="asset-info">
                          <div>
                            <h3>{a.title}</h3>
                            <Badge quality={a.analysis.quality} />
                          </div>
                          <p lang="tr">{a.analysis.feedback}</p>
                          <div className="tags">
                            {a.analysis.tags.slice(0, 3).map((t) => (
                              <span key={t} lang="tr">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  {!shown.length && (
                    <div className="empty-state">
                      <Images size={30} />
                      <h3>No content here yet</h3>
                      <p>
                        Try another filter or add your first photos and videos.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="draft-grid">
                  {data.posts.map((p) => (
                    <button
                      key={p.id}
                      className="draft-card"
                      onClick={() => setModal({ type: "post", post: p })}
                    >
                      <Media
                        asset={assets.find((a) => a.id === p.assetIds[0])}
                      />
                      <div>
                        <span className="eyebrow">
                          {p.status === "posted"
                            ? "MARKED AS POSTED"
                            : "SAVED DRAFT"}{" "}
                          · {p.format}
                        </span>
                        <p lang="tr">{p.caption}</p>
                        <span className="text-button">
                          Open post <ArrowRight size={15} />
                        </span>
                      </div>
                    </button>
                  ))}
                  {!data.posts.length && (
                    <div className="empty-state">
                      <BookOpen size={30} />
                      <h3>Your drafts will live here</h3>
                      <p>Select a photo or video to create your first post.</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {page === "Results" && (
            <Results
              data={data}
              connectCard={connectCard}
              metrics={(post) => setModal({ type: "metrics", post })}
            />
          )}
          {page === "How to use" && (
            <>
              <Heading
                eyebrow="YOU BAKE. WE’LL HELP WITH THE REST."
                title="A little help, every step of the way."
                text="No marketing experience needed. Start with what’s already on your phone."
              />
              <div className="how-grid">
                {[
                  [
                    Upload,
                    "Add your content",
                    "Upload the photos and videos you already take in the bakery. Add many at once. You don’t need to choose the good ones first.",
                    "Add content",
                    () => input.current.click(),
                  ],
                  [
                    Instagram,
                    "Connect Instagram",
                    "Optional, but helpful. A Professional Instagram account lets us learn from previous posts. Real Instagram sign-in will be connected in a later setup step.",
                    "Connect Instagram",
                    () => setModal({ type: "connect" }),
                  ],
                  [
                    Camera,
                    "Follow recommendations",
                    "We look at your available content, previous performance and the season in Istanbul to suggest what to post and what to capture next.",
                    "See Today",
                    () => go("Today"),
                  ],
                  [
                    Images,
                    "Create your post",
                    "Get selected media, a format, crop or trim advice, caption, screen text, CTA and hashtags. All marketing content is in Turkish. Review, download and share on Instagram.",
                    "Explore content",
                    () => go("Content"),
                  ],
                ].map(([Icon, title, copy, cta, action], i) => (
                  <section className="how-card" key={title}>
                    <div className="step-top">
                      <span>0{i + 1}</span>
                      <Icon size={27} />
                    </div>
                    <h2>{title}</h2>
                    <p>{copy}</p>
                    <button className="text-button" onClick={action}>
                      {cta}
                      <ArrowRight size={17} />
                    </button>
                  </section>
                ))}
              </div>
              <div className="setup-card">
                <h2>Your business is ready</h2>
                {[
                  ["Business profile", data.business.name],
                  ["Content language", "Turkish"],
                  [
                    "Instagram",
                    data.connection.connected
                      ? "Connected · read-only"
                      : "Not connected · optional",
                  ],
                  ["Google Business", "Coming later"],
                  ["Paid Ads", "Coming later"],
                ].map(([a, b], i) => (
                  <div key={a}>
                    <span>
                      {i < 2 && <Check size={17} />} {a}
                    </span>
                    <strong>{b}</strong>
                  </div>
                ))}
                <p>
                  Instagram access is read-only. This MVP prepares drafts for
                  you to share manually.
                </p>
              </div>
            </>
          )}
          {page === "Settings" && (
            <SettingsPage
              onLogout={onLogout ? () => run(onLogout) : null}
              data={data}
              busy={busy}
              save={(v) =>
                run(async () => {
                  await api("/business", v, "PATCH");
                  await reload();
                  setToast("Business profile saved");
                })
              }
              connect={() => setModal({ type: "connect" })}
            />
          )}
          {!["Today", "Content", "Results", "How to use", "Settings"].includes(
            page,
          ) && (
            <div className="empty-state">
              <h1>Let’s get you back.</h1>
              <button className="button primary" onClick={() => go("Today")}>
                Go to Today
              </button>
            </div>
          )}
        </main>
      </div>
      <input
        ref={input}
        className="visually-hidden"
        tabIndex={-1}
        type="file"
        aria-label="Upload photos and videos"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/quicktime,video/webm"
        onChange={(e) => uploadFiles(e.target.files)}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {modal && (
        <Modal
          title={
            {
              asset: "A closer look",
              post: "Your next post",
              generating: "Preparing your post",
              capture: "Your next cake, in three shots",
              connect: "Connect Instagram",
              metrics: "Record your results",
            }[modal.type]
          }
          onClose={() => {
            if (modal.type !== "generating") {
              setModal(null);
              setError("");
            }
          }}
          wide={["asset", "post"].includes(modal.type)}
        >
          {error && (
            <p className="modal-error" role="alert">
              {error}
            </p>
          )}
          {modal.type === "generating" && (
            <div className="empty-state">
              <LoaderCircle className="spin" size={32} />
              <h3>A little thought goes into every post.</h3>
              <p>
                Preparing your Turkish caption, text and editing suggestions…
              </p>
            </div>
          )}
          {modal.type === "asset" && (
            <div className="asset-detail">
              <div>
                <Media asset={modal.asset} controls />
                {modal.asset.demo && (
                  <small className="source-note">
                    Sample media
                    {modal.asset.type === "video"
                      ? " · Video concept shown with a still photo"
                      : ""}
                  </small>
                )}
              </div>
              <div className="detail-copy">
                <Badge quality={modal.asset.analysis.quality} />
                <h2>{modal.asset.title}</h2>
                <p lang="tr">{modal.asset.analysis.feedback}</p>
                <div className="tags">
                  {modal.asset.analysis.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                {["lighting", "framing", "subject"].map(
                  (k) =>
                    modal.asset.analysis[k] && (
                      <p key={k} className="detail-observation" lang="tr">
                        {modal.asset.analysis[k]}
                      </p>
                    ),
                )}
                <p className="source-note">
                  {modal.asset.analysis.source === "openai"
                    ? "AI image analysis"
                    : modal.asset.analysis.source === "demo"
                      ? "Seeded example analysis"
                      : "Local image checks · visual subject recognition requires AI"}
                  {modal.asset.type === "video"
                    ? " · Selected frame only; review motion and audio."
                    : ""}
                </p>
                {modal.asset.analysis.warning && (
                  <p className="notice" lang="tr">
                    {modal.asset.analysis.warning}
                  </p>
                )}
                <div className="detail-actions">
                  <button
                    className="button primary"
                    disabled={busy || modal.asset.analysis.quality === "Skip"}
                    onClick={() => create([modal.asset.id])}
                  >
                    Create post <ArrowRight size={17} />
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const asset = await api(
                          "/assets/" + modal.asset.id + "/analyze",
                          {},
                        );
                        setModal({ type: "asset", asset });
                        await reload();
                      })
                    }
                  >
                    Analyze again
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const asset = await api(
                          "/assets/" + modal.asset.id,
                          { used: !modal.asset.used },
                          "PATCH",
                        );
                        setModal({ type: "asset", asset });
                        await reload();
                      })
                    }
                  >
                    {modal.asset.used ? "Mark as unused" : "Mark as posted"}
                  </button>
                  {!modal.asset.demo &&
                    !data.posts.some((p) =>
                      p.assetIds.includes(modal.asset.id),
                    ) && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            !window.confirm(
                              "Delete this file from your workspace? This cannot be undone.",
                            )
                          )
                            return;
                          run(async () => {
                            await api(
                              `/assets/${modal.asset.id}`,
                              null,
                              "DELETE",
                            );
                            setModal(null);
                            await reload();
                            setToast(
                              "File deleted. Storage space is available again.",
                            );
                          });
                        }}
                      >
                        Delete file
                      </button>
                    )}
                </div>
              </div>
            </div>
          )}
          {modal.type === "post" && (
            <PostEditor
              key={modal.post.id}
              post={modal.post}
              assets={assets}
              business={data.business}
              busy={busy}
              run={run}
              notify={setToast}
              save={async (p) => {
                const post = await api(
                  "/posts/" + p.id,
                  {
                    caption: p.caption,
                    overlay: p.overlay,
                    cta: p.cta,
                    hashtags: p.hashtags,
                  },
                  "PATCH",
                );
                await reload();
                setModal({ type: "post", post });
                return post;
              }}
              mark={async (p) => {
                const post = await api("/posts/" + p.id + "/posted", {});
                await reload();
                setModal({ type: "post", post });
                setToast("Marked as posted. You can now add results.");
              }}
              results={(post) => setModal({ type: "metrics", post })}
            />
          )}
          {modal.type === "capture" && (
            <div className="capture-list">
              <p lang="tr">Bir sonraki pasta yapımında sadece bunları çek:</p>
              {[
                [
                  "2 saniye",
                  "Pastanın süslemeden önceki hali",
                  "Telefonu sabit tut. Pastanın tamamı görünsün.",
                ],
                [
                  "8–10 saniye",
                  "Süsleme yaparken",
                  "Kremayı sıkarken biraz yaklaş. Pencereden gelen ışığı kullan.",
                ],
                [
                  "4–5 saniye",
                  "Bitmiş pastayı yavaşça çevir",
                  "Dikey çek. Arka planı sade tut ve pastayı ortala.",
                ],
              ].map(([time, title, desc], i) => (
                <div className="shot" key={time}>
                  <span>{i + 1}</span>
                  <div>
                    <small>{time}</small>
                    <h3 lang="tr">{title}</h3>
                    <p lang="tr">{desc}</p>
                  </div>
                  <Video size={24} />
                </div>
              ))}
              <p lang="tr">
                Bu kadar. Çekimlerini yükle; paylaşım taslağını birlikte
                hazırlayalım.
              </p>
              <button
                className="button primary"
                onClick={() => {
                  setModal(null);
                  input.current.click();
                }}
              >
                Add your content <Plus size={17} />
              </button>
            </div>
          )}
          {modal.type === "connect" && (
            <div className="connect-detail">
              <div className="big-instagram">
                <Instagram size={32} />
              </div>
              <h2>A better feel for what works.</h2>
              <p>
                Connecting helps us see previous posts, learn what performs
                best, and make better recommendations.
              </p>
              <ul>
                <li>Read your profile and previous posts</li>
                <li>Read views, reach and interactions when available</li>
                <li>Use results to recommend what to create next</li>
              </ul>
              <p>
                <strong>
                  You’ll need an Instagram Professional account (Business or
                  Creator).
                </strong>
              </p>
              <p>
                Read-only connection. Crumb cannot publish, reply to comments,
                read messages or manage ads.
              </p>
              {!data.providers.instagramConfigured && (
                <div className="notice">
                  <strong>One-time setup needed</strong>
                  <p>
                    The app owner needs to finish Meta setup before Instagram
                    sign-in is available. Your content and drafts work without
                    connecting.
                  </p>
                </div>
              )}
              {data.connection.connected && (
                <div className="notice">
                  <strong>@{data.connection.username} · read-only</strong>
                  <p>
                    {data.connection.lastSyncedAt
                      ? `Last refreshed ${new Date(data.connection.lastSyncedAt).toLocaleString()}`
                      : "Connected. Refresh to import your recent results."}
                  </p>
                  {data.connection.insightsUnavailable && (
                    <p lang="tr">
                      Instagram bazı gönderilerin istatistiklerini paylaşmadı.
                      Eksik değerleri boş bıraktık.
                    </p>
                  )}
                  {data.connection.partial && (
                    <p lang="tr">
                      Sonuçların bir kısmını alabildik. Biraz sonra tekrar
                      yenileyebilirsin.
                    </p>
                  )}
                </div>
              )}
              <div className="button-row">
                <button
                  className="button primary"
                  disabled={busy || !data.providers.instagramConfigured}
                  onClick={() =>
                    run(async () => {
                      if (data.connection.connected) {
                        await api("/instagram/sync", {});
                        await reload();
                        setToast("Instagram results refreshed.");
                      } else {
                        const result = await api("/instagram/connect", {});
                        location.assign(result.url);
                      }
                    })
                  }
                >
                  {data.connection.connected
                    ? "Refresh results"
                    : "Connect Instagram"}
                  <ArrowRight size={17} />
                </button>
                {data.connection.connected && (
                  <>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const result = await api("/instagram/connect", {});
                          location.assign(result.url);
                        })
                      }
                    >
                      Reconnect
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const result = await api("/instagram/disconnect", {});
                          await reload();
                          setModal(null);
                          setToast(result.message);
                        })
                      }
                    >
                      Disconnect & remove imported results
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
          {modal.type === "metrics" && (
            <MetricsForm
              post={modal.post}
              existing={data.metrics.find((m) => m.postId === modal.post.id)}
              busy={busy}
              save={(v) =>
                run(async () => {
                  await api("/posts/" + modal.post.id + "/metrics", v, "PUT");
                  await reload();
                  setModal(null);
                  go("Results");
                  setToast(
                    "Results saved. Your recommendations have been updated.",
                  );
                })
              }
            />
          )}
        </Modal>
      )}
    </div>
  );
}
function Heading({ eyebrow, title, text, action }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}
function EmptyContent({ upload }) {
  return (
    <section className="empty-state">
      <Camera size={35} />
      <h2>I need more content</h2>
      <p lang="tr">
        Paylaşım için uygun içerik kalmadı. Bir sonraki pastanı gün ışığında
        çek; gerisini birlikte hazırlayalım.
      </p>
      <button className="button primary" onClick={upload}>
        Add your content <Plus size={17} />
      </button>
    </section>
  );
}
function Results({ data, connectCard, metrics }) {
  const s = data.summary;
  return (
    <>
      <Heading
        eyebrow="LESS GUESSING. MORE GOOD THINGS."
        title="See what’s finding its people."
        text="A few useful numbers. A clear idea of what to do next."
        action={<span className="period">Last 30 days</span>}
      />
      <div className="data-notice">
        <span className="online-dot" />
        {s.source === "demo"
          ? "Sample data — these are example results, not your real Instagram performance."
          : s.source === "instagram"
            ? "From Instagram · lifetime results for posts published in the last 30 days. Manual entries are excluded to avoid double counting."
            : s.source === "manual"
              ? "Your recorded results — sample data is excluded. Interactions sum the likes, comments and saves you entered."
              : "No results yet. Record results after sharing your first post."}
      </div>
      <div className="stats">
        {[
          ["Views", "views"],
          ["Reach", "reach"],
          ["Interactions", "interactions"],
        ].map(([label, key]) => (
          <div key={key}>
            <span>{label}</span>
            <strong>{number(s[key])}</strong>
            <small>
              {s.count} {s.count === 1 ? "post" : "posts"} in this period
            </small>
          </div>
        ))}
      </div>
      <p className="source-note" lang="tr">
        Erişim, gönderilerin toplamıdır; aynı kişi birden fazla gönderide
        sayılmış olabilir. Eksik sonuçlar ‘—’ ile gösterilir.
      </p>
      <div className="section-heading">
        <h2>What to take away</h2>
        <span>Numbers, translated into next steps</span>
      </div>
      <div className="results-insights">
        <section className="idea-card">
          <div className="eyebrow">
            <ChartNoAxesCombined size={17} /> WHAT’S WORKING
          </div>
          <h3 lang="tr">
            {s.ratio > 1
              ? "Kısa videolar öne çıkıyor."
              : s.ratio !== null && s.ratio < 1
                ? "Fotoğrafların öne çıkıyor."
                : s.ratio === 1
                  ? "İki format da denenebilir."
                  : "Biraz daha sonuç görelim."}
          </h3>
          <p lang="tr">
            {s.ratio > 1
              ? `${s.source === "demo" ? "Örnek verilerde" : "Sonuçlarına göre"} videolar, fotoğraflardan ortalama ${s.ratio} kat daha fazla görüntüleniyor. Bu bir garanti değil, yeni içerik için bir ipucu.`
              : s.ratio !== null && s.ratio < 1
                ? "Sonuçlarına göre fotoğrafların ortalama görüntülenmesi videolardan daha yüksek. Net bir pasta fotoğrafıyla devam edebilirsin."
                : s.ratio === 1
                  ? "Fotoğrafların ve videoların ortalama görüntülenmesi benzer. Yeni çekimleri deneyerek devam et."
                  : "Sağlıklı bir karşılaştırma için en az iki video ve iki fotoğraftan sonuç alalım. Şimdilik farklı çekimleri deneyebilirsin."}
          </p>
          {s.closeRatio > 1 && (
            <p lang="tr">
              {s.source === "demo" ? "Örnek verilerde " : ""}Yakın plan
              fotoğraflar geniş çekimlerden {s.closeRatio} kat daha fazla
              görüntüleniyor.
            </p>
          )}
        </section>
        <section className="idea-card peach">
          <div className="eyebrow">
            <Camera size={17} /> DO MORE OF THIS
          </div>
          <h3 lang="tr">Bir sonraki çekimin belli.</h3>
          <p lang="tr">{data.recommendation.capture}</p>
          <div className="divider" />
          <div className="eyebrow">DO LESS OF THIS</div>
          <p lang="tr">
            {s.ratio > 1
              ? "Sadece bitmiş pasta fotoğraflarıyla yetinme; araya hazırlık anlarını da ekle."
              : s.ratio !== null && s.ratio < 1
                ? "Her paylaşımı video yapmak zorunda değilsin. Net fotoğraflarına da yer ver."
                : "Henüz bir içerik türünü elemek için yeterli veri yok. Karanlık ve birbirinin aynı çekimleri paylaşma."}
          </p>
        </section>
      </div>
      <div className="section-heading">
        <h2>Recent posts</h2>
        <span>
          {s.source === "demo"
            ? "Sample Instagram history"
            : "Your recorded performance"}
        </span>
      </div>
      <div className="results-table">
        <div className="result-row table-head">
          <span>Content</span>
          <span>Views</span>
          <span>Reach</span>
          <span>Interactions</span>
        </div>
        {s.rows.map((m) => (
          <div className="result-row" key={m.id}>
            <div className="result-media">
              {m.thumbnail ? (
                <img src={m.thumbnail} alt="" />
              ) : (
                <div className="thumbnail-placeholder">
                  <Video size={18} />
                </div>
              )}
              <div>
                <strong>{m.title}</strong>
                <small>
                  {m.type === "VIDEO"
                    ? "Reel"
                    : m.type === "CAROUSEL"
                      ? "Carousel"
                      : m.type === "STORY"
                        ? "Story"
                        : "Photo"}{" "}
                  ·{" "}
                  {new Date(m.date).toLocaleDateString("en", {
                    timeZone: "Europe/Istanbul",
                    month: "short",
                    day: "numeric",
                  })}
                </small>
              </div>
            </div>
            <span>{number(m.views)}</span>
            <span>{number(m.reach)}</span>
            <span>{number(m.interactions)}</span>
          </div>
        ))}
        {!s.rows.length && (
          <p className="empty-state">
            No recorded results in the last 30 days.
          </p>
        )}
      </div>
      <div className="section-heading">
        <h2>Track a post you shared</h2>
        <span>Enter the numbers you see in Instagram</span>
      </div>
      <div className="track-list">
        {data.posts
          .filter((p) => p.status === "posted")
          .map((p) => (
            <button className="track-row" key={p.id} onClick={() => metrics(p)}>
              <span>
                {data.assets.find((a) => a.id === p.assetIds[0])?.title}
              </span>
              <span className="text-button">
                {s.rows.some((m) => m.postId === p.id)
                  ? "Update results"
                  : "Add results"}{" "}
                <Plus size={16} />
              </span>
            </button>
          ))}
        {!data.posts.some((p) => p.status === "posted") && (
          <p className="muted">
            After sharing a draft on Instagram, mark it as posted to record its
            results here.
          </p>
        )}
      </div>
      {connectCard()}
    </>
  );
}
function SettingsPage({ data, save, connect, busy, onLogout }) {
  const [v, setV] = useState(data.business);
  return (
    <>
      <Heading
        eyebrow="THE BASICS, TAKEN CARE OF"
        title="Your little corner."
        text="A few details help us make every suggestion feel like you."
      />
      <form
        className="settings-card"
        onSubmit={(e) => {
          e.preventDefault();
          save(v);
        }}
      >
        {[
          ["Business name", "name"],
          ["Industry", "industry"],
          ["Location", "location"],
        ].map(([label, key]) => (
          <label key={key}>
            {label}
            <input
              required
              maxLength={100}
              value={v[key]}
              onChange={(e) => setV({ ...v, [key]: e.target.value })}
            />
          </label>
        ))}
        <label>
          Content language
          <input value="Turkish" readOnly />
        </label>
        <small>
          Captions, recommendations and filming instructions are always in
          Turkish.
        </small>
        <button className="button primary" disabled={busy}>
          Save profile <Check size={17} />
        </button>
      </form>
      <div className="settings-card">
        <h2>Instagram</h2>
        <p>
          {data.connection.connected
            ? `Connected · @${data.connection.username} · read-only`
            : "Not connected · you can use the app without Instagram"}
        </p>
        <button className="button secondary" onClick={connect}>
          Manage connection <ArrowUpRight size={17} />
        </button>
      </div>
      {onLogout && (
        <div className="settings-card">
          <h2>Private workspace</h2>
          <p>Sign out when you’re done on a shared device.</p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={onLogout}
          >
            Sign out
          </button>
        </div>
      )}
    </>
  );
}
function PostEditor({
  post,
  assets,
  business,
  busy,
  run,
  notify,
  save,
  mark,
  results,
}) {
  const [p, setP] = useState(post),
    [index, setIndex] = useState(0);
  useEffect(() => setP(post), [post]);
  const selected = p.assetIds.map((id) => assets.find((a) => a.id === id)),
    a = selected[index],
    story = p.format === "Story" || p.format === "Reel";
  const full = [p.caption, p.cta, p.hashtags.join(" ")]
    .filter(Boolean)
    .join("\n\n");
  const exportText = () => {
    const blob = new Blob(
        [
          `${business.name}\n${p.format}\n\n${full}\n\nEkran yazısı: ${p.overlay}\n\nDüzenleme: ${p.edits}`,
        ],
        { type: "text/plain;charset=utf-8" },
      ),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "cake-gallery-post.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="post-editor">
      <div className="preview-column">
        <div className="preview-label">
          INSTAGRAM PREVIEW <span>{p.format}</span>
        </div>
        <div className="instagram-preview">
          <div className="ig-head">
            <div className="ig-avatar">cg</div>
            <div>
              <strong>{business.name}</strong>
              <small>{business.location}</small>
            </div>
            <MoreHorizontal size={20} />
          </div>
          <div className={"ig-media " + (story ? "portrait" : "")}>
            <Media asset={a} controls />
            {story && (
              <div className="ig-overlay" lang="tr">
                {p.overlay}
              </div>
            )}
            {selected.length > 1 && (
              <div className="carousel-controls">
                <button
                  onClick={() =>
                    setIndex((index + selected.length - 1) % selected.length)
                  }
                  aria-label="Previous media"
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  {index + 1}/{selected.length}
                </span>
                <button
                  onClick={() => setIndex((index + 1) % selected.length)}
                  aria-label="Next media"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
          <div className="ig-actions" aria-hidden="true">
            <Heart />
            <MessageCircle />
            <Send />
            <Bookmark />
          </div>
          <div className="ig-caption" lang="tr">
            <strong>{business.name} </strong>
            {full}
          </div>
        </div>
        <p className="source-note">
          Preview only · crop, trim and text are suggestions. Downloaded media
          stays original.
        </p>
        {p.format === "Reel" && (
          <div className="cover-preview">
            <img
              src={a.thumbnail || "/favicon.svg"}
              alt="Suggested Reel cover"
            />
            <div>
              <strong>Suggested Reel cover</strong>
              <p lang="tr">{p.overlay}</p>
              <a href={a.thumbnail || a.url} download="reel-cover.jpg">
                Download cover
              </a>
              {a.demo && <small>Sample still image</small>}
            </div>
          </div>
        )}
      </div>
      <div className="post-fields">
        <div className="pill-row">
          <span>{p.format}</span>
          <span>Türkçe</span>
          <span>{p.source === "template" ? "Template draft" : "AI draft"}</span>
          <span>{p.status === "posted" ? "Marked as posted" : "Draft"}</span>
        </div>
        {p.warning && (
          <p className="notice" lang="tr">
            {p.warning}
          </p>
        )}
        <label>
          Caption
          <textarea
            aria-label="Caption"
            lang="tr"
            rows={5}
            maxLength={1800}
            value={p.caption}
            onChange={(e) => setP({ ...p, caption: e.target.value })}
          />
        </label>
        <label>
          On-screen text
          <textarea
            aria-label="On-screen text"
            lang="tr"
            rows={2}
            maxLength={150}
            value={p.overlay}
            onChange={(e) => setP({ ...p, overlay: e.target.value })}
          />
        </label>
        <label>
          Call to action
          <input
            lang="tr"
            maxLength={200}
            value={p.cta}
            onChange={(e) => setP({ ...p, cta: e.target.value })}
          />
        </label>
        <label>
          Hashtags
          <input
            lang="tr"
            value={p.hashtags.join(" ")}
            onChange={(e) =>
              setP({
                ...p,
                hashtags: e.target.value.split(/\s+/).filter(Boolean),
              })
            }
          />
        </label>
        <small className={full.length > 2200 ? "error-text" : "muted"}>
          {full.length}/2,200 caption characters · Up to 6 hashtags
        </small>
        <div className="edit-advice">
          <h3>Make this small edit</h3>
          <p lang="tr">{p.edits}</p>
          <h3>Why this content?</h3>
          <p lang="tr">{p.reason}</p>
        </div>
        <div className="editor-actions">
          <button
            className="button primary"
            disabled={busy || full.length > 2200 || p.hashtags.length > 6}
            onClick={() =>
              run(async () => {
                await save(p);
                notify("Draft saved");
              })
            }
          >
            Save draft <Check size={17} />
          </button>
          <button
            className="button secondary"
            onClick={() =>
              run(async () => {
                await navigator.clipboard.writeText(full);
                notify("Caption copied");
              })
            }
          >
            <Copy size={16} /> Copy caption
          </button>
          <button className="button secondary" onClick={exportText}>
            <Download size={16} /> Download text
          </button>
        </div>
        <div className="media-downloads">
          {selected.map((a, i) => (
            <a
              href={a.url}
              key={a.id}
              download
              target="_blank"
              rel="noreferrer"
            >
              <Download size={14} /> Media {i + 1}
              {a.demo ? " (sample image)" : ""}
            </a>
          ))}
        </div>
        <div className="manual-publish">
          <p>
            Share manually on Instagram, then mark this post as posted. We never
            publish automatically.
          </p>
          {p.status === "posted" ? (
            <button className="text-button" onClick={() => results(p)}>
              Add or update results <ArrowRight size={17} />
            </button>
          ) : (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await save(p);
                  await mark(p);
                })
              }
            >
              I’ve posted this <CheckCheck size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
function MetricsForm({ post, existing, busy, save }) {
  const [v, setV] = useState({
    date: istanbulDay(existing?.date || post.postedAt || new Date()),
    ...Object.fromEntries(
      ["views", "reach", "likes", "comments", "saves"].map((k) => [
        k,
        existing?.[k] ?? "",
      ]),
    ),
  });
  return (
    <form
      className="metrics-form"
      onSubmit={(e) => {
        e.preventDefault();
        save({
          ...Object.fromEntries(
            ["views", "reach", "likes", "comments", "saves"].map((k) => [
              k,
              v[k] === "" ? null : Number(v[k]),
            ]),
          ),
          date: new Date(v.date + "T00:00:00+03:00").toISOString(),
        });
      }}
    >
      <p>
        Enter the actual numbers shown in Instagram. Leave anything unavailable
        blank. These results will inform your next recommendation.
      </p>
      <label>
        Posting date
        <input
          type="date"
          required
          max={istanbulDay(new Date())}
          value={v.date}
          onChange={(e) => setV({ ...v, date: e.target.value })}
        />
      </label>
      <div className="metric-fields">
        {["views", "reach", "likes", "comments", "saves"].map((k) => (
          <label key={k}>
            {k[0].toUpperCase() + k.slice(1)}
            <input
              type="number"
              min="0"
              max="10000000000"
              step="1"
              value={v[k]}
              placeholder="Not available"
              onChange={(e) => setV({ ...v, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <button className="button primary" disabled={busy}>
        Save results <Check size={17} />
      </button>
    </form>
  );
}
function GoogleMark() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
      <path
        fill="#4285F4"
        d="M43.6 20.5H24v8h11.3c-.5 2.6-2 4.8-4.3 6.3v5.2h6.9c4-3.7 6.2-9.1 6.2-15.5 0-1.4-.2-2.7-.5-4Z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.6 0 10.3-1.8 13.8-5l-6.9-5.2c-1.9 1.3-4.3 2.1-6.9 2.1-5.4 0-10-3.7-11.7-8.7H5.2v5.5C8.6 39.4 15.7 44 24 44Z"
      />
      <path
        fill="#FBBC05"
        d="M12.3 27.2a12 12 0 0 1 0-6.4v-5.5H5.2a20 20 0 0 0 0 17.4Z"
      />
      <path
        fill="#EA4335"
        d="M24 12.1c3 0 5.6 1 7.7 3l5.8-5.8C34.3 5.9 29.6 4 24 4 15.7 4 8.6 8.6 5.2 15.3l7.1 5.5c1.7-5 6.3-8.7 11.7-8.7Z"
      />
    </svg>
  );
}
function PrivateWorkspace() {
  const [session, setSession] = useState(null),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = async () => {
    const s = await api("/session");
    setSession(s);
    if (s.error) setError(s.error);
  };
  useEffect(() => {
    const status = new URLSearchParams(location.search).get("auth");
    const messages = {
      cancelled: "Google sign-in was cancelled. You can try again.",
      expired: "This sign-in link expired. Please try again.",
      denied:
        "This Google account does not have access to Cake Gallery. Use an invited account or ask the owner to add your email.",
      setup: "Google sign-in needs its one-time setup.",
    };
    if (status) {
      setError(messages[status] || "Please try signing in again.");
      history.replaceState(null, "", location.pathname + location.hash);
    }
    refresh().catch((e) => setError(e.message));
    const lock = () => {
      setSession((s) => ({ ...s, authenticated: false }));
      refresh().catch((e) => setError(e.message));
    };
    window.addEventListener("crumb-locked", lock);
    return () => window.removeEventListener("crumb-locked", lock);
  }, []);
  if (session?.authenticated)
    return (
      <App
        onLogout={
          session.protected
            ? async () => {
                await api("/logout", {});
                setCode("");
                setSession({ ...session, authenticated: false });
              }
            : null
        }
      />
    );
  const google = session?.provider === "google";
  return (
    <main className="access-page">
      <form
        className="settings-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (google) {
              const result = await api("/auth/google", {});
              location.assign(result.url);
            } else {
              await api("/login", { code });
              setCode("");
              await refresh();
            }
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>crumb</h1>
        <h2>Your private workspace.</h2>
        <p>Photos, ideas and posts for Cake Gallery Maslak.</p>
        {session ? (
          google ? (
            <>
              <button
                className="google-sign-in"
                disabled={busy || !session.ready}
              >
                <GoogleMark />
                {busy ? "Opening Google…" : "Continue with Google"}
              </button>
              <p className="auth-explanation">
                Use the Google account invited to this workspace. Your Google
                password stays with Google.
              </p>
              <small>
                Supabase securely manages sign-in and basic account details. No
                Gmail or Drive access is requested.
              </small>
              {!session.ready && (
                <p className="notice">
                  Google sign-in setup is still being completed. Please contact
                  the app owner.
                </p>
              )}
            </>
          ) : (
            <>
              <button type="button" className="google-sign-in" disabled>
                <GoogleMark />
                Continue with Google
              </button>
              <small>
                Google sign-in is waiting for its one-time setup. Your current
                access still works below.
              </small>
              <label>
                Temporary access code
                <input
                  aria-label="Access code"
                  type="password"
                  autoComplete="current-password"
                  value={code}
                  required
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <button className="button primary" disabled={busy}>
                {busy ? "Opening…" : "Open workspace"}
              </button>
              <small>
                Temporary access while Google sign-in is being configured.
              </small>
            </>
          )
        ) : (
          <p>Opening your workspace…</p>
        )}
        {error && <p role="alert">{error}</p>}
        {!session && error && (
          <button
            type="button"
            className="button secondary"
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            Try again
          </button>
        )}
      </form>
    </main>
  );
}
function directUpload(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.timeout = 180000;
    xhr.setRequestHeader("Content-Type", file.type || "image/jpeg");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new Error(
              "Upload failed or free storage is full. Please try again.",
            ),
          );
    xhr.onerror = () =>
      reject(new Error("Connection lost. Try this file again."));
    xhr.ontimeout = () =>
      reject(new Error("Upload timed out. Try this file again."));
    xhr.send(file);
  });
}
createRoot(document.getElementById("root")).render(<PrivateWorkspace />);
