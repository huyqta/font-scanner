'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Globe, Type, FileText, Loader2, AlertCircle, 
  CheckCircle2, ChevronRight, BarChart3, Download, ExternalLink,
  Activity, ListFilter
} from 'lucide-react';

interface ScanResult {
  url: string;
  fonts: string[];
}

interface ScanData {
  summary: string[];
  details: ScanResult[];
  totalScanned: number;
  totalFound: number;
}

export default function WPFontScanner() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScanData | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!data) return;

    const headers = ['URL', 'Fonts', 'Font Count'];
    const rows = data.details.map(page => [
      page.url,
      `"${page.fonts.join(', ')}"`,
      page.fonts.length
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `wp-fonts-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToJSON = () => {
    if (!data) return;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `wp-fonts-${new Date().toISOString().split('T')[0]}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculate font frequency for progress bars
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
        <aside className="w-80 flex flex-col gap-6 overflow-y-auto shrink-0">
          {/* Sitemap Discovery Section */}
          <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 p-5 backdrop-blur-sm">
            <h2 className="text-[10px] uppercase font-bold text-slate-500 mb-4 tracking-widest flex items-center gap-2">
              <Globe className="w-3 h-3" />
              Sitemap Discovery
            </h2>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-xs">
                <div className={`w-1.5 h-1.5 rounded-full ${data ? 'bg-blue-400' : 'bg-slate-600'}`}></div>
                <span className="text-slate-400">/wp-sitemap.xml</span>
                {data && <span className="ml-auto text-[10px] font-mono text-green-400">ACTIVE</span>}
              </li>
              <li className="flex items-center gap-3 text-xs">
                <div className={`w-1.5 h-1.5 rounded-full ${data ? 'bg-blue-400' : 'bg-slate-600'}`}></div>
                <span className="text-slate-400">/sitemap_index.xml</span>
                {data && <span className="ml-auto text-[10px] font-mono text-blue-400">INDEX</span>}
              </li>
            </ul>
            {data && (
              <div className="mt-6 pt-4 border-t border-slate-700/50">
                <h3 className="text-[10px] uppercase text-slate-400 font-bold mb-3 tracking-wider">Detected Pages</h3>
                <div className="text-[11px] space-y-2 font-mono text-blue-300/80 bg-slate-900/40 p-3 rounded-lg border border-slate-700/30">
                  <div className="flex justify-between">
                    <span>Total Pages:</span>
                    <span className="text-white">{data.totalFound}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Scan Limit:</span>
                    <span className="text-white">{data.totalScanned}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Global Font Summary */}
          <div className="bg-slate-800/40 flex-1 rounded-xl border border-slate-700/50 p-5 backdrop-blur-sm overflow-hidden flex flex-col">
            <h2 className="text-[10px] uppercase font-bold text-slate-500 mb-4 tracking-widest flex items-center gap-2">
              <Activity className="w-3 h-3" />
              Global Font Summary
            </h2>
            <div className="space-y-5 overflow-y-auto pr-2 custom-scrollbar">
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
          <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/20 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-blue-400" />
                Scanned Pages
              </h2>
              {data && (
                <span className="px-2 py-0.5 bg-slate-700 rounded-full text-[10px] font-mono text-slate-300">
                  {data.totalScanned} Total
                </span>
              )}
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
                    ? 'Hệ thống đang truy cập sitemap và quét các trang để tìm font-family.' 
                    : 'Nhập địa chỉ website WordPress của bạn vào thanh tìm kiếm ở trên để bắt đầu.'}
                </p>
              </div>
            )}
          </div>

          <footer className="px-6 py-3 border-t border-slate-700/50 bg-slate-900/40 text-[10px] text-slate-500 flex justify-between items-center shrink-0">
            <span>Showing {data?.details.length || 0} of {data?.totalFound || 0} results</span>
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
