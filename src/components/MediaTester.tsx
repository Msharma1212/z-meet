import React, { useState, useEffect, useRef } from 'react';
import { Camera, Mic, Speaker, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface MediaTesterProps {
  filter?: 'video' | 'audio';
}

const MediaTester: React.FC<MediaTesterProps> = ({ filter }) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<string>('');
  const [selectedAudio, setSelectedAudio] = useState<string>('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const getDevices = async () => {
      try {
        const dev = await navigator.mediaDevices.enumerateDevices();
        setDevices(dev);
        
        const videoDev = dev.find(d => d.kind === 'videoinput');
        const audioDev = dev.find(d => d.kind === 'audioinput');
        
        if (videoDev) setSelectedVideo(videoDev.deviceId);
        if (audioDev) setSelectedAudio(audioDev.deviceId);
      } catch (err) {
        console.error("Error getting devices:", err);
      }
    };

    getDevices();
    
    // Listen for device changes
    navigator.mediaDevices.ondevicechange = getDevices;
    
    return () => {
      navigator.mediaDevices.ondevicechange = null;
    };
  }, []);

  useEffect(() => {
    const startPreview = async () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      try {
        const constraints: MediaStreamConstraints = {
          video: filter === 'audio' ? false : (selectedVideo ? { deviceId: { exact: selectedVideo } } : true),
          audio: filter === 'video' ? false : (selectedAudio ? { deviceId: { exact: selectedAudio } } : true)
        };
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        setStream(newStream);
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
        }

        // Audio analysis
        if (filter !== 'video') {
          setupAudioAnalysis(newStream);
        }
      } catch (err) {
        console.error("Error starting preview:", err);
      }
    };

    if (selectedVideo || selectedAudio) {
      startPreview();
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [selectedVideo, selectedAudio, filter]);

  const setupAudioAnalysis = (stream: MediaStream) => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setAudioLevel(average / 128); // Normalize roughly
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (e) {
      console.warn("Audio analysis failed", e);
    }
  };

  const videoDevices = devices.filter(d => d.kind === 'videoinput');
  const audioDevices = devices.filter(d => d.kind === 'audioinput');
  const speakerDevices = devices.filter(d => d.kind === 'audiooutput');

  return (
    <div className="space-y-6">
      {filter !== 'audio' && (
        <div className="space-y-4">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Camera className="w-3 h-3" /> Camera Settings
          </label>
          <select 
            value={selectedVideo}
            onChange={(e) => setSelectedVideo(e.target.value)}
            className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all cursor-pointer"
          >
            {videoDevices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>
            ))}
            {videoDevices.length === 0 && <option value="">No Camera Found</option>}
          </select>
          {selectedVideo && (
            <div className="aspect-video bg-black rounded-lg overflow-hidden border border-white/5">
              <video muted ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />
            </div>
          )}
        </div>
      )}

      {filter !== 'video' && (
        <>
          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Mic className="w-3 h-3" /> Microphone
            </label>
            <div className="space-y-3">
              <select 
                value={selectedAudio}
                onChange={(e) => setSelectedAudio(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all cursor-pointer"
              >
                {audioDevices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 5)}`}</option>
                ))}
                {audioDevices.length === 0 && <option value="">No Mic Found</option>}
              </select>
              
              <div className="flex items-center gap-2 bg-slate-950 rounded-lg p-2 overflow-hidden h-6 border border-white/5">
                 <div 
                   className="h-full bg-blue-500 rounded-full transition-all duration-75"
                   style={{ width: `${Math.min(100, audioLevel * 100)}%` }}
                 />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Speaker className="w-3 h-3" /> Speakers
            </label>
            <select 
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all cursor-pointer"
            >
              {speakerDevices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0, 5)}`}</option>
              ))}
              {speakerDevices.length === 0 && <option value="">System Default</option>}
            </select>
          </div>
        </>
      )}

      <div className="pt-4 border-t border-white/5 space-y-3">
        <div className="flex items-center gap-2 text-emerald-500">
           <CheckCircle2 className="w-4 h-4" />
           <span className="text-[10px] font-black uppercase tracking-widest">Configuration Active</span>
        </div>
      </div>
    </div>
  );
};

export default MediaTester;
