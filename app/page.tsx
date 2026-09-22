'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Globe, Type, FileText, Loader2, AlertCircle, 
  CheckCircle2, ChevronRight, BarChart3, Download, ExternalLink,
  Activity, ListFilter, FolderOpen, FileType2, Radar, Layers
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ScanResult {
  url: string;
  fonts: string[];
}

interface FontFile {
  url: string;
  filename: string;
  format: string;
  foundOnPages: string[];
}

interface ScanData {
  summary: string[];
  details: ScanResult[];
  totalScanned: number;
  totalFound: number;
  fontFiles: FontFile[];
  discoveryMethod: 'sitemap' | 'robots-txt' | 'crawl' | 'homepage';
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const DISCOVERY_METHOD_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  sitemap:    { label: 'Sitemap',    color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30' },
  'robots-txt': { label: 'Robots.txt', color: 'text-cyan-400',   bg: 'bg-cyan-500/10 border-cyan-500/30' },
  crawl:      { label: 'Crawl',     color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/30' },
  homepage:   { label: 'Homepage',  color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/30' },
};

const FORMAT_COLORS: Record<string, string> = {
  WOFF2: 'bg-blue-600/80 text-blue-100',
  WOFF:  'bg-cyan-600/80 text-cyan-100',
  TTF:   'bg-purple-600/80 text-purple-100',
  OTF:   'bg-indigo-600/80 text-indigo-100',
  EOT:   'bg-slate-600/80 text-slate-200',
};

// ─── Main Component ─────────────────────────────────────────────────────────────

type MainTab = 'pages' | 'fontfiles';

export default function WPFontScanner() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScanData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>('pages');
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Đã xảy ra lỗi khi scan website.');
      }

      setData(result);
      setMainTab('pages');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadFont = async (fontFile: FontFile) => {
    setDownloadingUrl(fontFile.url);
    try {
      const encoded = btoa(encodeURIComponent(fontFile.url));
      const res = await fetch(`/api/download-font?url=${encoded}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Download failed');
      }
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fontFile.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDownloadingUrl(null);
    }
  };

  const downloadAllFonts = async () => {
    if (!data?.fontFiles?.length) return;
    for (const ff of data.fontFiles) {
      await downloadFont(ff);
      // Small delay to avoid hammering browser
      await new Promise(r => setTimeout(r, 400));
    }
  };

  const getExportFilename = (ext: string) => {
    const domain = url ? new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname : 'wp-fonts';
    const date = new Date().toISOString().split('T')[0];
    return `${domain}-${date}.${ext}`;
  };

  const exportToCSV = () => {
    if (!data) return;
    const headers = ['URL', 'Fonts', 'Font Count'];
    const rows = data.details.map(page => [
      page.url,
      `"${page.fonts.join(', ')}"`,
      page.fonts.length
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const objUrl = URL.createObjectURL(blob);
    link.setAttribute('href', objUrl);
    link.setAttribute('download', getExportFilename('csv'));
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToJSON = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const objUrl = URL.createObjectURL(blob);
    link.setAttribute('href', objUrl);
    link.setAttribute('download', getExportFilename('json'));
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fontStats = useMemo(() => {
    if (!data) return [];
    const stats: Record<string, number> = {};
    data.details.forEach(page => {
      page.fonts.forEach(font => {
        stats[font] = (stats[font] || 0) + 1;
      });
    });
    return Object.entries(stats)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / data.totalScanned) * 100)
      }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const discoveryInfo = data ? DISCOVERY_METHOD_LABELS[data.discoveryMethod] : null;

  return (
    <div className="flex flex-col h-screen w-full bg-[#0F172A] text-slate-200 overflow-hidden font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-slate-800 bg-[#1E293B] shadow-lg shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white shadow-lg shadow-blue-900/20">
            <Type className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            WP<span className="text-blue-400">Font</span>Scanner
          </h1>
        </div>

        <div className="flex flex-1 max-w-2xl mx-12">
          <form onSubmit={handleScan} className="flex w-full bg-slate-900/50 rounded-lg border border-slate-700 p-1 group focus-within:border-blue-500/50 transition-all">
            <input
              type="text"
              placeholder="Nhập URL website (VD: example.com)"
              className="bg-transparent flex-1 px-4 text-sm outline-none text-slate-200 placeholder-slate-500"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !url}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white px-6 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {loading ? 'Scanning...' : 'New Scan'}
            </button>
          </form>
        </div>

        <div className="flex gap-4 items-center shrink-0">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
            Status: {loading ? 'Running' : data ? 'Completed' : 'Idle'}
          </span>
          <div className={`w-2.5 h-2.5 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : data ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-slate-600'}`}></div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden p-6 gap-6">
        {/* Sidebar */}
        <aside className="w-80 flex flex-col gap-4 overflow-y-auto shrink-0">
          {/* Sitemap Discovery Section */}
          <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 p-5 backdrop-blur-sm">
            <h2 className="text-[10px] uppercase font-bold text-slate-500 mb-4 tracking-widest flex items-center gap-2">
              <Radar className="w-3 h-3" />
              URL Discovery
            </h2>

            {/* Discovery method badge */}
            {discoveryInfo && (
              <div className={`mb-4 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold ${discoveryInfo.bg}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${discoveryInfo.color.replace('text-', 'bg-')}`} />
                <span className={discoveryInfo.color}>Method: {discoveryInfo.label}</span>
              </div>
            )}

            <ul className="space-y-2.5">
              {['/wp-sitemap.xml', '/sitemap_index.xml', '/sitemap.xml', 'robots.txt → Sitemap', 'Homepage crawl'].map((label) => (
                <li key={label} className="flex items-center gap-3 text-xs">
                  <div className={`w-1.5 h-1.5 rounded-full ${data ? 'bg-blue-400' : 'bg-slate-600'}`}></div>
                  <span className="text-slate-400 font-mono">{label}</span>
                </li>
              ))}
            </ul>

            {data && (
              <div className="mt-5 pt-4 border-t border-slate-700/50">
                <h3 className="text-[10px] uppercase text-slate-400 font-bold mb-3 tracking-wider">Stats</h3>
                <div className="text-[11px] space-y-2 font-mono text-blue-300/80 bg-slate-900/40 p-3 rounded-lg border border-slate-700/30">
                  <div className="flex justify-between">
                    <span>Pages Found:</span>
                    <span className="text-white">{data.totalFound}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pages Scanned:</span>
                    <span className="text-white">{data.totalScanned}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Font Files:</span>
                    <span className="text-green-400">{data.fontFiles?.length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Unique Fonts:</span>
                    <span className="text-blue-300">{data.summary.length}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Font Files Download Section */}
          <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 p-5 backdrop-blur-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest flex items-center gap-2">
                <FolderOpen className="w-3 h-3" />
                Font Files
                {data?.fontFiles?.length ? (
                  <span className="px-1.5 py-0.5 bg-blue-600/30 text-blue-300 rounded text-[10px] font-mono">
                    {data.fontFiles.length}
                  </span>
                ) : null}
              </h2>
              {data?.fontFiles?.length ? (
                <button
                  onClick={downloadAllFonts}
                  disabled={downloadingUrl !== null}
                  className="text-[10px] uppercase font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-40"
                >
                  <Download className="w-3 h-3" />
                  All
                </button>
              ) : null}
            </div>

            <div className="space-y-2 overflow-y-auto max-h-72 pr-1 custom-scrollbar">
              {data?.fontFiles?.length ? (
                data.fontFiles.map((ff, i) => (
                  <motion.div
                    key={ff.url}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-start gap-2 bg-slate-900/40 rounded-lg p-2.5 border border-slate-700/30 hover:border-blue-500/30 transition-all group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${FORMAT_COLORS[ff.format] || 'bg-slate-600/80 text-slate-200'}`}>
                          {ff.format}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {ff.foundOnPages.length}pg
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-slate-300 truncate" title={ff.filename}>
                        {ff.filename}
                      </p>
                    </div>
                    <button
                      onClick={() => downloadFont(ff)}
                      disabled={downloadingUrl === ff.url}
                      title={`Download ${ff.filename}`}
                      className="shrink-0 p-1.5 rounded hover:bg-blue-600/20 text-slate-500 hover:text-blue-400 transition-all disabled:opacity-40"
                    >
                      {downloadingUrl === ff.url
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Download className="w-3.5 h-3.5" />
                      }
                    </button>
                  </motion.div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-slate-600">
                  <FileType2 className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-[11px] italic text-center">Chưa có file font nào được phát hiện.</p>
                </div>
              )}
            </div>
          </div>

          {/* Global Font Summary */}
          <div className="bg-slate-800/40 flex-1 rounded-xl border border-slate-700/50 p-5 backdrop-blur-sm overflow-hidden flex flex-col min-h-40">
            <h2 className="text-[10px] uppercase font-bold text-slate-500 mb-4 tracking-widest flex items-center gap-2">
              <Activity className="w-3 h-3" />
              Global Font Summary
            </h2>
            <div className="space-y-5 overflow-y-auto pr-2 custom-scrollbar flex-1">
              {fontStats.length > 0 ? (
                fontStats.map((font, i) => (
                  <div key={i} className="group">
                    <div className="flex items-end justify-between mb-2">
                      <span className="text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors" style={{ fontFamily: font.name }}>
                        {font.name}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {font.count} pg ({font.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${font.percentage}%` }}
                        className={`h-full rounded-full shadow-sm ${
                          i === 0 ? 'bg-blue-500' : i === 1 ? 'bg-cyan-500' : 'bg-indigo-500'
                        }`}
                      ></motion.div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                  <Type className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-xs italic text-center">Chưa có dữ liệu font để hiển thị.</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Content Section */}
        <section className="flex-1 flex flex-col bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden backdrop-blur-sm shadow-2xl shadow-black/20">
          {/* Tab Bar */}
          <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/20 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMainTab('pages')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  mainTab === 'pages'
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ListFilter className="w-3.5 h-3.5" />
                Scanned Pages
                {data && (
                  <span className="px-1.5 py-0.5 bg-slate-700/80 rounded-full text-[10px] font-mono text-slate-300">
                    {data.totalScanned}
                  </span>
                )}
              </button>
              <button
                onClick={() => setMainTab('fontfiles')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  mainTab === 'fontfiles'
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Font Files
                {data?.fontFiles?.length ? (
                  <span className="px-1.5 py-0.5 bg-green-600/30 rounded-full text-[10px] font-mono text-green-300">
                    {data.fontFiles.length}
                  </span>
                ) : null}
              </button>
            </div>

            <div className="flex gap-4">
              <button
                onClick={exportToCSV}
                disabled={!data}
                className="text-[10px] uppercase font-bold text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Download className="w-3 h-3" />
                CSV Export
              </button>
              <button
                onClick={exportToJSON}
                disabled={!data}
                className="text-[10px] uppercase font-bold text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Download className="w-3 h-3" />
                JSON
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar">
            {error ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="bg-red-500/10 p-4 rounded-full mb-4">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Đã xảy ra lỗi</h3>
                <p className="text-slate-400 text-sm max-w-md">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="mt-6 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold transition-all"
                >
                  Thử lại
                </button>
              </div>
            ) : data ? (
              <>
                {/* Pages Tab */}
                <AnimatePresence mode="wait">
                  {mainTab === 'pages' && (
                    <motion.div key="pages" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-[#1E293B]/95 backdrop-blur-sm shadow-sm">
                          <tr className="text-[10px] uppercase text-slate-500 tracking-wider border-b border-slate-700/50">
                            <th className="px-6 py-4 font-bold">Relative URL</th>
                            <th className="px-6 py-4 font-bold">Detected Fonts</th>
                            <th className="px-6 py-4 font-bold text-right">Count</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-slate-700/30">
                          {data.details.map((page, idx) => (
                            <motion.tr
                              key={idx}
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.02 }}
                              className="hover:bg-slate-700/20 transition-colors group"
                            >
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="font-mono text-blue-400 text-[13px] truncate max-w-md">
                                    {page.url.replace(url.startsWith('http') ? url : `https://${url}`, '') || '/'}
                                  </span>
                                  <a
                                    href={page.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] text-slate-500 hover:text-blue-400 flex items-center gap-1 w-fit mt-0.5 transition-colors"
                                  >
                                    Visit Page <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1.5">
                                  {page.fonts.map((f, fi) => (
                                    <span
                                      key={fi}
                                      className="px-2 py-0.5 bg-slate-900/50 text-[11px] text-slate-300 rounded border border-slate-700/50 group-hover:border-blue-500/30 transition-all"
                                      style={{ fontFamily: f }}
                                    >
                                      {f}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right text-slate-400 font-mono text-xs">
                                {page.fonts.length}
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </motion.div>
                  )}

                  {/* Font Files Tab */}
                  {mainTab === 'fontfiles' && (
                    <motion.div key="fontfiles" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      {data.fontFiles?.length ? (
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 z-10 bg-[#1E293B]/95 backdrop-blur-sm shadow-sm">
                            <tr className="text-[10px] uppercase text-slate-500 tracking-wider border-b border-slate-700/50">
                              <th className="px-6 py-4 font-bold">Filename</th>
                              <th className="px-6 py-4 font-bold">Format</th>
                              <th className="px-6 py-4 font-bold">Source URL</th>
                              <th className="px-6 py-4 font-bold text-center">Found on</th>
                              <th className="px-6 py-4 font-bold text-center">Download</th>
                            </tr>
                          </thead>
                          <tbody className="text-sm divide-y divide-slate-700/30">
                            {data.fontFiles.map((ff, idx) => (
                              <motion.tr
                                key={idx}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.03 }}
                                className="hover:bg-slate-700/20 transition-colors group"
                              >
                                <td className="px-6 py-4">
                                  <span className="font-mono text-slate-200 text-[13px]">{ff.filename}</span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`text-[10px] font-bold px-2 py-1 rounded ${FORMAT_COLORS[ff.format] || 'bg-slate-600/80 text-slate-200'}`}>
                                    {ff.format}
                                  </span>
                                </td>
                                <td className="px-6 py-4 max-w-xs">
                                  <a
                                    href={ff.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[11px] font-mono text-slate-400 hover:text-blue-400 truncate block transition-colors"
                                    title={ff.url}
                                  >
                                    {ff.url}
                                  </a>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <span className="text-xs font-mono text-slate-400">
                                    {ff.foundOnPages.length} {ff.foundOnPages.length === 1 ? 'page' : 'pages'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <button
                                    onClick={() => downloadFont(ff)}
                                    disabled={downloadingUrl === ff.url}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 hover:border-blue-400/50 text-blue-300 hover:text-blue-200 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    {downloadingUrl === ff.url
                                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Downloading...</>
                                      : <><Download className="w-3 h-3" /> Download</>
                                    }
                                  </button>
                                </td>
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full p-12 text-slate-600">
                          <FileType2 className="w-16 h-16 mb-4 opacity-20" />
                          <h3 className="text-lg font-bold text-slate-500 mb-2">Không tìm thấy file font nào</h3>
                          <p className="text-sm max-w-sm text-center">
                            Không có file font (.woff2, .ttf, .otf...) nào được host trực tiếp trên server này.
                            Font có thể đến từ Google Fonts hoặc CDN bên ngoài.
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-600">
                <motion.div
                  animate={{
                    scale: loading ? [1, 1.1, 1] : 1,
                    opacity: loading ? [0.2, 0.5, 0.2] : 0.2
                  }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  <Search className="w-20 h-20 mb-4" />
                </motion.div>
                <h3 className="text-xl font-bold text-slate-500 mb-2">
                  {loading ? 'Đang phân tích website...' : 'Sẵn sàng quét website'}
                </h3>
                <p className="text-sm max-w-sm">
                  {loading
                    ? 'Hệ thống đang tìm URL, quét CSS và phát hiện file font được host trên server.'
                    : 'Nhập địa chỉ website vào thanh tìm kiếm ở trên để bắt đầu.'}
                </p>
              </div>
            )}
          </div>

          <footer className="px-6 py-3 border-t border-slate-700/50 bg-slate-900/40 text-[10px] text-slate-500 flex justify-between items-center shrink-0">
            <span>Showing {data?.details.length || 0} of {data?.totalFound || 0} results</span>
            {discoveryInfo && data && (
              <span className={`font-mono uppercase tracking-wider ${discoveryInfo.color}`}>
                Discovery: {discoveryInfo.label}
              </span>
            )}
            <span className="font-mono opacity-60 italic uppercase tracking-tighter">Crawler: WP-FONT-SCANNER/1.0 (Next.js)</span>
          </footer>
        </section>
      </main>

      {/* Bottom Footer */}
      <footer className="px-8 py-3 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-[11px] shrink-0">
        <div className="flex gap-8">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-slate-400 uppercase tracking-widest font-semibold">Total Unique Fonts:</span>
            <b className="text-slate-200 text-sm font-mono">{data?.summary.length || 0}</b>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
            <span className="text-slate-400 uppercase tracking-widest font-semibold">Pages Processed:</span>
            <b className="text-slate-200 text-sm font-mono">{data?.totalScanned || 0}</b>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-slate-400 uppercase tracking-widest font-semibold">Font Files:</span>
            <b className="text-slate-200 text-sm font-mono">{data?.fontFiles?.length || 0}</b>
          </div>
        </div>
        <div className="text-slate-500 flex items-center gap-2">
          <CheckCircle2 className="w-3 h-3 text-green-500/50" />
          Powered by Gemini AI Engine
        </div>
      </footer>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 116, 139, 0.4);
        }
      `}</style>
    </div>
  );
}
