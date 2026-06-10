import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { 
  Video, 
  Plus, 
  Users, 
  Calendar, 
  Clock,
  ArrowRight,
  Shield,
  Zap,
  Globe,
  History,
  Megaphone,
  X,
  Send,
  Loader2,
  Trash2,
  Info,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Gift
} from 'lucide-react';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { Meeting } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import io from 'socket.io-client';

export const Dashboard = () => {
  const { user } = useAuth();
  const { t, localeCode } = useTranslation();
  const navigate = useNavigate();
  const [meetingCode, setMeetingCode] = useState('');
  const [history, setHistory] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Referral states
  const [hostMeetingsData, setHostMeetingsData] = useState<{ hostName: string | null; meetings: Meeting[] }>({ hostName: null, meetings: [] });
  const [audienceData, setAudienceData] = useState<{ count: number; users: any[] }>({ count: 0, users: [] });
  const [dismissedMeetingIds, setDismissedMeetingIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dismissed_meeting_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Create form state
  const [ctitle, setCTitle] = useState(`${user?.name}'s Meeting`);
  const [cEnableWaitingRoom, setCEnableWaitingRoom] = useState(false);

  // Schedule form state
  const [stitle, setSTitle] = useState('');
  const [sscheduledAt, setSScheduledAt] = useState('');
  const [sEnableWaitingRoom, setSEnableWaitingRoom] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    const fetchData = async () => {
      try {
        const historyRes = await api.get('/meetings/history');
        setHistory(Array.isArray(historyRes.data) ? historyRes.data : []);

        // Fetch host referred meetings if applicable
        if (user?.referredBy) {
          try {
            const hostResult = await api.get('/meetings/host-meetings');
            setHostMeetingsData(hostResult.data);
          } catch (err) {
            console.error('Failed to load host meetings:', err);
          }
        }

        // Fetch host audience stats
        try {
          const audienceResult = await api.get('/auth/audience');
          setAudienceData(audienceResult.data);
        } catch (err) {
          console.error('Failed to load audience:', err);
        }
      } catch (error: any) {
        console.error('Failed to fetch data:', error);
        setHistory([]);
        if (error.response?.status === 401) {
          // Handled by interceptor
        } else if (error.response?.status === 503) {
          toast.error(error.response?.data?.message || 'Database connection issues');
        }
      }
    };

    if (user) {
      fetchData();
    }
    
    return () => clearInterval(timer);
  }, [user]);

  // Dynamic Welcome Voice Greeting (text-to-speech) triggers only once on dashboard load
  useEffect(() => {
    if (!user || !user.name) return;

    // Check setting
    const voiceEnabled = user.settings?.voiceEnabled ?? true;
    if (!voiceEnabled) return;

    if (sessionStorage.getItem("greeted") === "true") return;

    const speakWelcome = (name: string) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;

      window.speechSynthesis.cancel();

      const messages = [
        `Hey ${name}, welcome to Meeting's world`,
        `Welcome ${name}, initializing your experience`,
        `Hello ${name}, entering your meeting space`,
        `Hi ${name}, get ready to connect`
      ];

      const randomMessage = messages[Math.floor(Math.random() * messages.length)];

      const speech = new SpeechSynthesisUtterance(randomMessage);
      speech.lang = "en-US";
      speech.pitch = 1;
      speech.rate = 0.9;

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        speech.voice = voices.find(v => v.name.includes("Google") || v.name.includes("Natural")) || voices[0];
      }

      window.speechSynthesis.speak(speech);
    };

    const timer = setTimeout(() => {
      speakWelcome(user.name);
      sessionStorage.setItem("greeted", "true");
    }, 500);

    return () => clearTimeout(timer);
  }, [user]);

  const handleCreateMeeting = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/meetings/create', { 
        title: ctitle,
        isBroadcast: false,
        enableWaitingRoom: cEnableWaitingRoom
      });
      toast.success('Meeting created!');
      navigate(`/meeting/${data.code}`);
    } catch (error: any) {
      toast.error('Failed to create meeting');
    } finally {
      setLoading(false);
      setIsCreateModalOpen(false);
    }
  };

  const handleJoinMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingCode) return;
    setLoading(true);
    try {
      const { data } = await api.post('/meetings/join', { code: meetingCode });
      navigate(`/meeting/${data.code}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Invalid meeting code');
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stitle || !sscheduledAt) return;
    setIsScheduling(true);
    try {
      const { data } = await api.post('/meetings/schedule', {
        title: stitle,
        startTime: sscheduledAt,
        isBroadcast: false,
        enableWaitingRoom: sEnableWaitingRoom
      });
      setHistory((prev) => [data, ...prev]);
      setIsScheduleModalOpen(false);
      setSTitle('');
      setSScheduledAt('');
      toast.success('Meeting scheduled!');
    } catch (error: any) {
      toast.error('Failed to schedule meeting');
    } finally {
      setIsScheduling(false);
    }
  };

  const [selectedUpcomingId, setSelectedUpcomingId] = useState<string | null>(null);

  const handleDeleteMeeting = async (id: string) => {
    try {
      const meetingToDelete = history.find(m => m._id === id);
      await api.delete(`/meetings/${id}`);
      setHistory((prev) => prev.filter(m => m._id !== id));
      
      // Notify active room participants of deletion to force client exit
      try {
        const socket = io();
        socket.emit("meeting-deleted", { meetingId: id, meetingCode: meetingToDelete?.code });
        setTimeout(() => socket.disconnect(), 1000);
      } catch (e) {
        console.error("Failed to emit meeting-deleted:", e);
      }

      if (meetingToDelete?.code) {
        setHostMeetingsData((prev) => ({
          ...prev,
          meetings: prev.meetings.filter(m => m.code !== meetingToDelete.code)
        }));
      }
      toast.success('Item deleted');
    } catch (error: any) {
      toast.error('Deletion failed');
    }
  };

  const handleDeleteHostMeeting = async (id: string, meetingCode?: string) => {
    try {
      const isOwner = user?.role === 'admin' || user?.role === 'developer' || user?.role === 'co-admin' || history.some(m => m._id === id);
      if (isOwner) {
        await api.delete(`/meetings/${id}`);
        setHistory((prev) => prev.filter(m => m._id !== id));
        
        // Notify active room participants of deletion to force client exit
        try {
          const socket = io();
          socket.emit("meeting-deleted", { meetingId: id, meetingCode });
          setTimeout(() => socket.disconnect(), 1000);
        } catch (e) {
          console.error("Failed to emit meeting-deleted:", e);
        }

        setHostMeetingsData((prev) => ({
          ...prev,
          meetings: prev.meetings.filter(m => m._id !== id)
        }));
        toast.success('Meeting deleted successfully');
      } else {
        const updated = [...dismissedMeetingIds, id];
        setDismissedMeetingIds(updated);
        localStorage.setItem('dismissed_meeting_ids', JSON.stringify(updated));
        toast.success('Meeting removed from your dashboard');
      }
    } catch (error) {
      const updated = [...dismissedMeetingIds, id];
      setDismissedMeetingIds(updated);
      localStorage.setItem('dismissed_meeting_ids', JSON.stringify(updated));
      toast.success('Meeting removed from view');
    }
  };



  return (
    <motion.div 
      initial={{ opacity: 0, scale: 1.08, filter: 'blur(20px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      className="flex-1 grid grid-cols-12 gap-8"
    >
      <div className="col-span-12 lg:col-span-8 space-y-6 md:space-y-8">
        {/* Time & Card Section */}
        <div className="relative h-40 md:h-72 rounded-3xl overflow-hidden shadow-2xl group flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/60 via-purple-600/40 to-slate-900/60 z-10 transition-opacity group-hover:opacity-80"></div>
          <img 
            src="https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&q=80&w=1024" 
            className="absolute inset-0 w-full h-full object-cover scale-105 group-hover:scale-100 transition-transform duration-700" 
            alt="Dashboard"
          />
          <div className="absolute inset-0 flex flex-col justify-center px-8 md:px-12 z-20">
            <div className="text-4xl md:text-7xl font-extrabold tracking-tighter text-white mb-1 drop-shadow-lg">
              {currentTime.toLocaleTimeString(localeCode, { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-xs md:text-xl text-blue-100 font-bold uppercase tracking-widest opacity-90 drop-shadow-md">
              {currentTime.toLocaleDateString(localeCode, { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
        </div>

        {/* Referral and Host Audience Dashboard Widget */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Box 1: Your Referral Hub */}
          <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 p-6 rounded-3xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-orange-600/10 p-2.5 rounded-xl">
                  <Gift className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <h4 className="font-black text-white text-sm uppercase tracking-wider">Your Referral Hub</h4>
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-tight">Earn influence by inviting others</p>
                </div>
              </div>
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Your Share Code</p>
                  <p className="text-white font-mono font-black text-lg tracking-wider uppercase mt-0.5">{user?.referralCode || 'NOT_FOUND'}</p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(user?.referralCode || '');
                    toast.success('Referral code copied!');
                  }}
                  className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                >
                  Copy Code
                </button>
              </div>
            </div>

            {/* Display "Joined via" sponsor badge if applicable */}
            {user?.referredBy && hostMeetingsData.hostName ? (
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mt-2 bg-purple-500/10 border border-purple-500/10 p-2.5 rounded-xl">
                <Users className="w-4 h-4 text-purple-400" />
                <span>Joined via: <span className="text-purple-400 font-extrabold uppercase">{hostMeetingsData.hostName}</span></span>
              </div>
            ) : null}
          </div>

          {/* Box 2: Host Audience Performance */}
          <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 p-6 rounded-3xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-purple-600/10 p-2.5 rounded-xl">
                  <Users className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h4 className="font-black text-white text-sm uppercase tracking-wider">Your Audience</h4>
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-tight">Users who joined via your code</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-purple-400 font-mono block leading-none">{audienceData.count || 0}</span>
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mt-0.5">Total Users</span>
              </div>
            </div>

            {/* Audience List */}
            <div className="flex-1 overflow-y-auto max-h-[100px] pr-1 space-y-2 font-sans custom-scrollbar">
              {audienceData.users && audienceData.users.length > 0 ? (
                audienceData.users.map((audUser) => (
                  <div key={audUser._id} className="flex items-center justify-between bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60 hover:bg-slate-950/80 transition-colors">
                    <div>
                      <p className="text-xs font-bold text-white leading-none">{audUser.name}</p>
                      <p className="text-[9px] text-slate-500 font-mono mt-0.5">{audUser.email}</p>
                    </div>
                    <span className="text-[8px] font-black uppercase text-slate-500 bg-slate-800/45 px-1.5 py-0.5 rounded">
                      Ref Code
                    </span>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-center py-4 border border-dashed border-slate-800/85 rounded-xl">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-normal">
                    No users have registered with your code yet
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>



        {/* Your Host Meetings Section (Additive Section) */}
        {user?.referredBy && hostMeetingsData.meetings && hostMeetingsData.meetings.filter(m => !dismissedMeetingIds.includes(m._id)).length > 0 && (
          <div className="space-y-4 md:space-y-6">
            <h3 className="text-lg md:text-2xl font-black text-white tracking-widest uppercase flex items-center gap-2 md:gap-3">
              <Video className="w-5 h-5 md:w-6 md:h-6 text-purple-500" />
              Your Host Meetings ({hostMeetingsData.hostName})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              {hostMeetingsData.meetings.filter(m => !dismissedMeetingIds.includes(m._id)).map((meeting) => (
                <div key={meeting._id} className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 p-4 md:p-6 rounded-2xl md:rounded-3xl relative overflow-hidden group/item hover:border-purple-500/50 transition-all">
                  <div className="absolute top-3 right-3 opacity-0 group-hover/item:opacity-100 transition-opacity z-10">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteHostMeeting(meeting._id, meeting.code);
                      }}
                      className="p-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all shadow-lg"
                      title="Remove from Dashboard"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className="bg-purple-600/10 p-2 md:p-3 rounded-xl md:rounded-2xl shrink-0">
                      <Video className="w-4 h-4 md:w-5 md:h-5 text-purple-500" />
                    </div>
                    <div className="flex-1 space-y-1 overflow-hidden">
                      <h4 className="font-bold text-white uppercase tracking-tight text-sm md:text-base truncate">{meeting.title}</h4>
                      <p className="text-xs text-slate-400">Meeting Code: <span className="font-mono">{meeting.code}</span></p>
                      
                      <div className="flex items-center justify-between pt-3 gap-2">
                        <span className="text-[10px] font-bold text-[#10b981] uppercase bg-[#10b981]/10 px-2 py-0.5 rounded border border-[#10b981]/10 animate-pulse">
                          {meeting.isLive ? 'LIVE' : 'Scheduled'}
                        </span>
                        <button 
                          onClick={() => navigate(`/meeting/${meeting.code}`)}
                          className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest shrink-0 transition-colors"
                        >
                          Join Host
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            disabled={loading}
            className="flex flex-col items-center justify-center bg-orange-600 hover:bg-orange-500 text-white rounded-2xl md:rounded-3xl h-28 md:h-40 transition-all shadow-lg shadow-orange-600/20 group disabled:opacity-50"
          >
            <div className="bg-white/20 p-2 md:p-3 rounded-xl md:rounded-2xl mb-1.5 md:mb-3 group-hover:scale-110 transition-transform">
              <Plus className="w-5 h-5 md:w-8 md:h-8" />
            </div>
            <span className="font-bold text-xs md:text-base">{t.newMeeting}</span>
          </button>

          <div className="contents">
            <div className="flex flex-col items-center justify-center bg-slate-900 border border-slate-800 rounded-2xl md:rounded-3xl h-28 md:h-40 group p-2 md:p-4">
              <div className="bg-blue-600/20 p-2 md:p-3 rounded-xl md:rounded-2xl mb-1.5 md:mb-3 group-hover:scale-110 transition-transform">
                <Users className="w-5 h-5 md:w-8 md:h-8 text-blue-500" />
              </div>
              <form onSubmit={handleJoinMeeting} className="w-full flex gap-1 md:gap-2">
                <input 
                  type="text" 
                  placeholder={t.join}
                  value={meetingCode}
                  onChange={(e) => setMeetingCode(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-1.5 md:px-2 py-1 text-[9px] md:text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button type="submit" className="p-1 bg-blue-600 rounded-lg shrink-0"><ArrowRight className="w-3 h-3 md:w-4 md:h-4"/></button>
              </form>
              <span className="font-bold mt-1 md:mt-2 text-[10px] md:text-sm">{t.join}</span>
            </div>
          </div>

          <button 
            onClick={() => setIsScheduleModalOpen(true)}
            className="flex flex-col items-center justify-center bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white rounded-2xl md:rounded-3xl h-28 md:h-40 transition-all group"
          >
            <div className="bg-purple-600/10 p-2 md:p-3 rounded-xl md:rounded-2xl mb-1.5 md:mb-3 group-hover:scale-110 transition-transform">
              <Calendar className="w-5 h-5 md:w-8 md:h-8 text-purple-500" />
            </div>
            <span className="font-bold text-xs md:text-sm">{t.schedule || 'Schedule'}</span>
          </button>

          <button 
            onClick={() => navigate('/history')}
            className="flex flex-col items-center justify-center bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white rounded-2xl md:rounded-3xl h-28 md:h-40 transition-all group"
          >
            <div className="bg-emerald-600/10 p-2 md:p-3 rounded-xl md:rounded-2xl mb-1.5 md:mb-3 group-hover:scale-110 transition-transform">
              <History className="w-5 h-5 md:w-8 md:h-8 text-emerald-500" />
            </div>
            <span className="font-bold text-xs md:text-sm">{t.history}</span>
          </button>
        </div>
      </div>

      {/* Sidebar Content */}
      <div className="col-span-12 lg:col-span-4 bg-slate-900/50 border border-slate-800/50 rounded-3xl p-6 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-xl text-white uppercase tracking-tighter">{t.upcoming}</h3>
        </div>

        <div className="space-y-4 flex-1 overflow-y-auto pr-1">
          {(() => {
            const now = new Date();
            const meetingItems = history
              .filter(m => (m.startTime && new Date(m.startTime) > now) || (!m.isLive && m.startTime && new Date(m.startTime) > now))
              .map(m => ({ ...m, type: 'meeting', time: m.startTime }));

            const allUpcoming = meetingItems
              .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
              .filter(item => {
                const itemTime = new Date(item.time).getTime();
                const twoHoursAgo = now.getTime() - 2 * 60 * 60000;
                return itemTime > twoHoursAgo;
              })
              .slice(0, 8); // Show a few more in the sidebar

            if (allUpcoming.length === 0) {
              return (
                <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                  {t.noMeetingsScheduled}
                </div>
              );
            }

            const formatDate = (dateStr: string) => {
              const d = new Date(dateStr);
              return d.toLocaleDateString(localeCode, { weekday: 'short', month: 'short', day: 'numeric' });
            };

            const formatTime = (dateStr: string) => {
              try {
                if (!dateStr) return t.pending;
                
                // If the string contains T, we can try to extract parts directly 
                // to avoid any automatic timezone shifts by the Date object.
                if (dateStr.includes('T')) {
                  const [datePart, timePart] = dateStr.split('T');
                  const [hoursStr, minutesStr] = timePart.split(':');
                  let hours = parseInt(hoursStr, 10);
                  const minutes = minutesStr.slice(0, 2);
                  const ampm = hours >= 12 ? 'PM' : 'AM';
                  hours = hours % 12;
                  hours = hours ? hours : 12;
                  return `${hours}:${minutes} ${ampm}`;
                }

                const date = new Date(dateStr);
                if (isNaN(date.getTime())) return t.pending;
                
                let hours = date.getHours();
                const minutes = date.getMinutes().toString().padStart(2, '0');
                const ampm = hours >= 12 ? 'PM' : 'AM';
                hours = hours % 12;
                hours = hours ? hours : 12;
                return `${hours}:${minutes} ${ampm}`;
              } catch (e) {
                return t.pending;
              }
            };

            return allUpcoming.map((item: any) => {
              const isSelected = selectedUpcomingId === item._id;
              
              return (
                <div 
                  key={item._id} 
                  onClick={() => setSelectedUpcomingId(item._id)}
                  className={cn(
                    "p-4 rounded-2xl border relative transition-all cursor-pointer group/item",
                    isSelected ? "bg-slate-800 border-blue-500 shadow-2xl shadow-blue-500/10" : "bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
                  )}
                >
                  <div className="absolute top-3 right-3 opacity-0 group-hover/item:opacity-100 transition-opacity z-10">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMeeting(item._id);
                      }}
                      className="p-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all shadow-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  
                  {isSelected && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-12 bg-blue-500 rounded-r-full"></div>}
                  <div className={cn("flex flex-col mb-2")}>
                     <div className={cn("text-[9px] font-black uppercase tracking-widest mb-1", isSelected ? "text-blue-400" : "text-slate-500")}>
                      Meeting
                    </div>
                  </div>
                  <div className="font-bold text-white text-base mb-1 line-clamp-1 pr-8">{item.title}</div>
                  
                  <div className="space-y-1 mb-4">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                      <Calendar className="w-3 h-3" />
                      {item.time && !isNaN(new Date(item.time).getTime()) ? formatDate(item.time) : ''}
                    </div>
                    <div className={cn("flex items-center gap-2 text-[10px] font-black uppercase tracking-widest", isSelected ? "text-blue-400" : "text-slate-500")}>
                      <Clock className="w-3 h-3" />
                      {item.time && !isNaN(new Date(item.time).getTime()) ? formatTime(item.time) : t.pending}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-slate-500 font-mono">
                      {item.code || item.meetingCode ? `ID: ${item.code || item.meetingCode}` : `By: ${item.hostName}`}
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        const code = item.code || item.meetingCode;
                        if (code) navigate(`/meeting/${code}`);
                      }}
                      className={cn(
                        "px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                        isSelected ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                      )}
                    >
                      {t.join || 'Join'}
                    </button>
                  </div>
                </div>
              );
            });
          })()}
        </div>

        <div className="mt-8">
          <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-6 rounded-2xl text-center shadow-xl shadow-blue-900/20">
            <p className="text-xs font-bold text-blue-100/70 uppercase mb-2">{t.proFeatures}</p>
            <p className="text-sm font-semibold text-white mb-4 leading-relaxed">{t.unlimitedRecording}</p>
            <button className="w-full bg-white text-blue-700 py-3 rounded-xl font-bold text-sm shadow-xl hover:bg-blue-50 transition-colors">
              {t.upgradeNow}
            </button>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">New Meeting</h3>
              <button 
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateMeeting} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Meeting Title</label>
                <input 
                  type="text" 
                  value={ctitle}
                  onChange={(e) => setCTitle(e.target.value)}
                  placeholder="E.g., Design Sync"
                  className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  required
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-3">
                  <Lock className={cn("w-5 h-5", cEnableWaitingRoom ? "text-blue-500" : "text-slate-500")} />
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-tight">Enable Waiting Room</p>
                    <p className="text-[8px] text-slate-500 uppercase font-bold">Host must Admit participants</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setCEnableWaitingRoom(!cEnableWaitingRoom)}
                  className={cn(
                    "w-10 h-5 rounded-full transition-all relative",
                    cEnableWaitingRoom ? "bg-blue-600" : "bg-slate-800"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-all",
                    cEnableWaitingRoom && "translate-x-5"
                  )} />
                </button>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-500 text-white py-4 rounded-2xl font-bold transition-all shadow-xl shadow-orange-600/20 flex items-center justify-center gap-2 group disabled:opacity-50 mt-4"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                Start Meeting
              </button>
            </form>
          </div>
        </div>
      )}


      {/* Schedule Modal */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Schedule Meeting</h3>
              <button 
                onClick={() => setIsScheduleModalOpen(false)}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleScheduleMeeting} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Meeting Title</label>
                <input 
                  type="text" 
                  value={stitle}
                  onChange={(e) => setSTitle(e.target.value)}
                  placeholder="E.g., Team Sync"
                  className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Date & Time</label>
                <input 
                  type="datetime-local" 
                  value={sscheduledAt}
                  onChange={(e) => setSScheduledAt(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                  required
                />
              </div>



              <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-3">
                  <Lock className={cn("w-5 h-5", sEnableWaitingRoom ? "text-blue-500" : "text-slate-500")} />
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-tight">Waiting Room</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setSEnableWaitingRoom(!sEnableWaitingRoom)}
                  className={cn(
                    "w-10 h-5 rounded-full transition-all relative",
                    sEnableWaitingRoom ? "bg-blue-600" : "bg-slate-800"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-all",
                    sEnableWaitingRoom && "translate-x-5"
                  )} />
                </button>
              </div>

              <button 
                type="submit" 
                disabled={isScheduling}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white py-4 rounded-2xl font-bold transition-all shadow-xl shadow-purple-600/20 flex items-center justify-center gap-2 group disabled:opacity-50"
              >
                {isScheduling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Calendar className="w-5 h-5" />}
                Schedule Now
              </button>
            </form>
          </div>
        </div>
      )}
      <div className="col-span-12 py-8 mt-4 flex flex-col items-center gap-2 opacity-30 select-none">
        <div className="w-12 h-[1px] bg-white/10" />
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Developed by Mayank Sharma</p>
      </div>
    </motion.div>
  );
};
