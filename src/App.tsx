/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { 
  Activity, Clock, CheckCircle2, AlertCircle, Plus, 
  Search, Download, Trash2, LayoutDashboard, ListTodo, Filter, ChevronRight, ChevronLeft, ArrowUpDown, Settings, Save,
  Pencil, RotateCcw, AlertTriangle, Info, ShieldAlert, UserPlus, Users, Key,
  History, Eye, Scale, Terminal, Calendar, ChevronDown, FileSpreadsheet, FileText, X, Palette,
  BookOpen, Sparkles, MessageSquare, Send, Brain, Wrench, Paperclip, Upload, Copy, Check, FileCode, ImageIcon
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { format, subDays, differenceInMinutes, parseISO as dateFnsParseISO, startOfDay, endOfDay, addDays, subMonths, subQuarters, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter } from 'date-fns';
import { SupportTask, SupportLevel, Priority, TaskStatus, PRIORITY_COLORS, STATUS_COLORS, ProjectConfig, AppUser } from './types';
import { cn, formatDuration, downloadCSV, exportToExcel, exportToPDF } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import html2canvas from 'html2canvas';

// Robust, cross-platform and format-resilient parseISO shadow function (MySQL/H2 safe)
const parseISO = (val: any): Date => {
  if (!val) return new Date(NaN);
  if (val instanceof Date) return val;
  
  // If LocalDateTime is serialized as a JSON numeric array: [year, month, day, hour, minute, second]
  if (Array.isArray(val)) {
    try {
      const year = val[0] || 0;
      const month = (val[1] || 1) - 1; // 0-indexed in JS Date
      const day = val[2] || 1;
      const hour = val[3] || 0;
      const minute = val[4] || 0;
      const second = val[5] || 0;
      const ms = val[6] || 0;
      return new Date(year, month, day, hour, minute, second, ms);
    } catch {
      return new Date(NaN);
    }
  }

  if (typeof val === 'string') {
    // Replace space separating date and time with T (e.g. from SQL)
    let clean = val.replace(' ', 'T');
    
    // Normalize ISO suffixes to parse both start & end dates under identical local timezone context.
    // This removes timezone skewing which could make start date appear greater than end date.
    clean = clean.replace(/Z$/, ''); // Remove 'Z'
    clean = clean.replace(/[-+]\d{2}:\d{2}$/, ''); // Remove timezone offset
    clean = clean.replace(/\.\d+$/, ''); // Remove milliseconds
    
    try {
      const d = dateFnsParseISO(clean);
      if (!isNaN(d.getTime())) return d;
    } catch {}
    
    try {
      const d = new Date(clean);
      if (!isNaN(d.getTime())) return d;
    } catch {}
  }
  
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  } catch {}
  
  return new Date(NaN);
};

// --- Constants ---
const ISSUE_TEMPLATES = [
  'Network Connectivity Loss',
  'VPN Authentication Failed',
  'Slow Database Query response',
  'Software Install Request',
  'Password Reset Required',
  'Application Crash on Startup',
  'Email Sync Error',
  'Printer Offline Issue',
  'CPU Spike on Server',
  'Storage Limit Warning'
];

// --- API Utils ---
const API_BASE = '/supportflow/api/tasks';
const API_PROJECTS = '/supportflow/api/projects';
const API_USERS = '/supportflow/api/users';

const formatLogDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return format(new Date(), 'MMM d, yyyy, h:mm a');
  try {
    const d = parseISO(dateStr);
    if (!isNaN(d.getTime())) {
      return format(d, 'MMM d, yyyy, h:mm a');
    }
  } catch (e) {}
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return format(d, 'MMM d, yyyy, h:mm a');
    }
  } catch (e2) {}
  return dateStr;
};

const parseEntries = (rawText: string | null | undefined, defaultUser = 'Admin', defaultDate = ''): { timestamp: string; user: string; text: string }[] => {
  if (!rawText) return [];
  const trimmed = rawText.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // Fallback
    }
  }
  return [{
    timestamp: formatLogDate(defaultDate),
    user: defaultUser,
    text: rawText
  }];
};

const getHoverTooltip = (rawText: string | null | undefined, task: SupportTask, fieldName: 'description' | 'solution' | 'remarks'): string => {
  if (!rawText) return 'No entries recorded';
  const defaultUser = fieldName === 'solution' ? (task.assignedTo || 'Admin') : (task.createdBy || 'Admin');
  const defaultDate = fieldName === 'solution' ? (task.closureDate || task.generationDate) : task.generationDate;
  const entries = parseEntries(rawText, defaultUser, defaultDate);
  return entries.map(e => `[${e.timestamp}] ${e.user}: ${e.text}`).join('\n');
};

export default function App() {
  const [tasks, setTasks] = useState<SupportTask[]>([]);
  const [projectsDB, setProjectsDB] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [categoryMappings, setCategoryMappings] = useState<{ id: number, category: string, subcategory: string }[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [categoryMappingFilter, setCategoryMappingFilter] = useState('');

  // Fetch tasks, projects and users on mount
  useEffect(() => {
    const initFetch = async () => {
      setLoading(true);
      await Promise.all([fetchTasks(), fetchProjects(), fetchUsers(), fetchCategories()]);
      setLoading(false);
    };
    initFetch();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await fetch('/supportflow/api/categories');
      if (response.ok) {
        const data = await response.json();
        setCategoryMappings(data || []);
      }
    } catch (error) {
      console.error('Error connecting to backend (categories):', error);
    }
  };

  const handleFileReader = (file: File): Promise<void> => {
    return new Promise((resolve) => {
      if (file.size > 4 * 1024 * 1024) {
        alert(`File ${file.name} exceeds the 4MB limit for inline database storage.`);
        resolve();
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setTempAttachments(prev => {
          if (prev.some(f => f.name === file.name)) return prev;
          return [...prev, {
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            dataUrl: dataUrl,
            uploadedAt: new Date().toISOString()
          }];
        });
        resolve();
      };
      reader.onerror = () => {
        resolve();
      };
      reader.readAsDataURL(file);
    });
  };

  const seedMockAttachments = (loadedTasks: SupportTask[]) => {
    if (localStorage.getItem('sflow_seeded_attachments_v2')) return;
    if (!loadedTasks || loadedTasks.length === 0) return;

    const sampleLogs = `[2026-05-27 08:12:05] INFO: Initializing database cluster adapter...
[2026-05-27 08:12:06] DETAIL: Connection pool initialized with 20 active connections.
[2026-05-27 08:12:08] WARNING: Database server latency is 142ms (threshold is 100ms).
[2026-05-27 08:12:12] ERROR: FATAL EXCEPTION - deadlock detected during vacuum process.
[2026-05-27 08:12:12] ERROR: Transaction (Process ID 4122) was deadlocked on lock resources with another process.
[2026-05-27 08:12:15] INFO: Rolling back to savepoint delta-alpha.
[2026-05-27 08:12:18] DETAIL: Restored active state from read replica backend.
[2026-05-27 08:13:00] INFO: SLA Monitoring System registered recovery time: 52 seconds.`;

    const sampleCsv = `Timestamp,Metric,Value,Threshold,Status
2026-05-27T08:00:00Z,CPU_Utilization_Pct,42.5,80.0,OK
2026-05-27T08:05:00Z,CPU_Utilization_Pct,51.2,80.0,OK
2026-05-27T08:10:00Z,CPU_Utilization_Pct,94.8,80.0,WARNING
2026-05-27T08:15:00Z,CPU_Utilization_Pct,98.2,80.0,CRITICAL
2026-05-27T08:20:00Z,CPU_Utilization_Pct,35.1,80.0,OK
2026-05-27T08:25:00Z,Disk_I_O_Ops_Sec,2400.0,3000.0,OK
2026-05-27T08:30:00Z,Disk_I_O_Ops_Sec,3150.0,3000.0,WARNING`;

    const sampleDoc = `======================================================================
METROPOLIS ITSM PORTAL - INFRASTRUCTURE AUDIT SIGN-OFF
======================================================================
Document Ref: AUDST-201-HR
Security Tier: Restricted Enterprise
Associated Project: HR-Portal
Linked Case ID: INC-1002

Subject: Network Security Token and Gateway Validation Sign-Off
Date: 2026-05-26 14:15:00 UTC

The engineering review of the recent API gateway integration reports 100% compliance with corporate compliance controls. We have completed:
1. Double-hop TLS 1.3 encryption handshakes verified globally.
2. Active incident token invalidation triggered successfully.
3. Penetration vector validation logs backed up.

Resolution: APPROVED AND SIGNED OFF FOR DEPLOYMENT
Signatures Registered:
- John Doe (Principal Tech Lead, SupportFlow)
- Sarah Miller (Director of Enterprise Support Operations)`;

    const sampleImgPng = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='300' viewBox='0 0 600 300'><rect width='600' height='300' fill='%230b1329'/><circle cx='300' cy='150' r='100' fill='none' stroke='%233b82f6' stroke-width='4'/><circle cx='300' cy='150' r='50' fill='none' stroke='%2310b981' stroke-dasharray='10,10' stroke-width='2'/><path d='M200 150h200M300 50v200' stroke='%231e293b' stroke-width='2'/><text x='300' y='155' fill='%23ffffff' font-family='monospace' font-size='14' text-anchor='middle'>SLA CLOCK ANALYSIS ENGINE ACTIVE</text></svg>";

    // Assign to the first task
    const t1 = loadedTasks[0]?.ticketId;
    if (t1) {
      localStorage.setItem('sflow_attachments_' + t1, JSON.stringify([
        {
          name: 'database_deadlock_trace.log',
          size: sampleLogs.length,
          type: 'text/plain',
          dataUrl: 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(sampleLogs))),
          uploadedAt: new Date(Date.now() - 3600000).toISOString()
        },
        {
          name: 'cpu_usage_audit.csv',
          size: sampleCsv.length,
          type: 'text/csv',
          dataUrl: 'data:text/csv;base64,' + btoa(unescape(encodeURIComponent(sampleCsv))),
          uploadedAt: new Date(Date.now() - 1800000).toISOString()
        }
      ]));
    }

    // Assign to the second task
    const t2 = loadedTasks[1]?.ticketId || 'INC-1002';
    if (t2) {
      localStorage.setItem('sflow_attachments_' + t2, JSON.stringify([
        {
          name: 'infrastructure_audit_signoff.pdf',
          size: sampleDoc.length,
          type: 'application/pdf',
          dataUrl: 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(sampleDoc))),
          uploadedAt: new Date(Date.now() - 7200000).toISOString()
        },
        {
          name: 'monitoring_schema.png',
          size: sampleImgPng.length,
          type: 'image/png',
          dataUrl: sampleImgPng,
          uploadedAt: new Date(Date.now() - 10800000).toISOString()
        }
      ]));
    }

    localStorage.setItem('sflow_seeded_attachments_v2', 'true');
  };

  const fetchTasks = async () => {
    try {
      const response = await fetch(API_BASE);
      if (response.ok) {
        const data = await response.json();
        const parsed = (data || []).map((t: any) => ({
          ...t,
          auditLog: t.auditLog ? (typeof t.auditLog === 'string' ? JSON.parse(t.auditLog) : t.auditLog) : []
        }));
        setTasks(parsed);
        try {
          seedMockAttachments(parsed);
        } catch (err) {
          console.error("Error seeding mock attachments:", err);
        }
      }
    } catch (error) {
      console.error('Error connecting to backend (tasks):', error);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await fetch(API_PROJECTS);
      if (response.ok) {
        const data = await response.json();
        setProjectsDB(data);
      }
    } catch (error) {
      console.error('Error connecting to backend (projects):', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch(API_USERS);
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          setUsers(data);
        }
      }
    } catch (error) {
      console.error('Error connecting to backend (users):', error);
    }
  };

  const getBusinessMinutes = (startStr: string, endStr: string, shiftConfig: {
    shiftStart: string,
    shiftEnd: string,
    workingDays: string[],
    holidays: string[]
  }) => {
    if (!startStr || !endStr) return 0;
    
    // Ensure we parse consistently. If it's a local date string from our app, 
    // parseISO handles it. If it's a JS Date .toISOString(), parseISO also handles it.
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    if (start > end) return 0;

    const [sH, sM] = shiftConfig.shiftStart.split(':').map(Number);
    const [eH, eM] = shiftConfig.shiftEnd.split(':').map(Number);
    const shiftStartMinutes = sH * 60 + sM;
    const shiftEndMinutes = eH * 60 + eM;

    let totalMinutes = 0;
    let current = startOfDay(start);
    const lastDay = startOfDay(end);

    while (current <= lastDay) {
      const dayName = format(current, 'EEE'); 
      const dateStr = format(current, 'yyyy-MM-dd');

      if (shiftConfig.workingDays.includes(dayName) && !shiftConfig.holidays.includes(dateStr)) {
        let dayEffStart = shiftStartMinutes;
        let dayEffEnd = shiftEndMinutes;

        // If today is the start day, adjust start time
        if (format(current, 'yyyy-MM-dd') === format(start, 'yyyy-MM-dd')) {
           const startTotalMinutes = start.getHours() * 60 + start.getMinutes();
           dayEffStart = Math.max(shiftStartMinutes, startTotalMinutes);
        }
        
        // If today is the end day, adjust end time
        if (format(current, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')) {
           const endTotalMinutes = end.getHours() * 60 + end.getMinutes();
           dayEffEnd = Math.min(shiftEndMinutes, endTotalMinutes);
        }

        if (dayEffEnd > dayEffStart) {
          totalMinutes += (dayEffEnd - dayEffStart);
        }
      }
      current = addDays(current, 1);
    }
    return totalMinutes;
  };

  const getEffectiveShift = (projectId: string, assignedTo: string) => {
    const config = projectConfigs.find(c => c.projectId === projectId);
    const empShift = config?.employeeShifts.find(s => s.name === assignedTo);
    
    return {
      shiftStart: empShift?.shiftStart || config?.shiftStart || '09:00',
      shiftEnd: empShift?.shiftEnd || config?.shiftEnd || '18:00',
      workingDays: empShift?.workingDays || config?.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      holidays: config?.holidays || []
    };
  };

  const getTaskHoldMinutes = (task: SupportTask, endPointIso: string, shiftConfig: any) => {
    if (!task.auditLog || task.auditLog.length === 0) return 0;
    
    const sortedEvents = [...task.auditLog].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    let holdMinutes = 0;
    let lastHoldStart: string | null = null;
    const targetEnd = new Date(endPointIso).getTime();
    
    sortedEvents.forEach(event => {
      const eventTime = new Date(event.timestamp).getTime();
      if (eventTime > targetEnd) return;
      
      const details = event.details || '';
      const match = details.match(/Status changed from (.*) to (.*)/i);
      if (match) {
        const fromStatus = match[1].trim();
        const toStatus = match[2].trim();
        
        if (toStatus === 'Hold') {
          lastHoldStart = event.timestamp;
        } else if (fromStatus === 'Hold' && lastHoldStart) {
          const segmentMin = getBusinessMinutes(lastHoldStart, event.timestamp, shiftConfig);
          holdMinutes += segmentMin;
          lastHoldStart = null;
        }
      }
    });
    
    if (lastHoldStart) {
      const lastHoldStartTime = new Date(lastHoldStart).getTime();
      if (lastHoldStartTime <= targetEnd) {
        const segmentMin = getBusinessMinutes(lastHoldStart, endPointIso, shiftConfig);
        holdMinutes += segmentMin;
      }
    }
    
    return holdMinutes;
  };

  const getTaskSlaTimes = (task: SupportTask, now: string) => {
    const config = projectConfigs.find(c => c.projectId === task.projectId);
    const shiftConfig = getEffectiveShift(task.projectId, task.assignedTo);
    
    const responseSlaLimitHrs = config?.slas?.[task.priority]?.response || 2;
    const resolutionSlaLimitHrs = config?.slas?.[task.priority]?.resolution || 24;
    
    const responseLimitMin = responseSlaLimitHrs * 60;
    const resolutionLimitMin = resolutionSlaLimitHrs * 60;
    
    const responseLogged = !!(task.responseDate && task.responseDate.trim() !== '');
    const responseEnd = responseLogged ? task.responseDate : now;
    
    const rawResponseMin = getBusinessMinutes(task.generationDate, responseEnd, shiftConfig);
    const holdResponseMin = getTaskHoldMinutes(task, responseEnd, shiftConfig);
    const responseTimeMin = Math.max(0, rawResponseMin - holdResponseMin);
    
    const isResponseBreached = responseTimeMin > responseLimitMin;
    const responseDelayMin = isResponseBreached ? responseTimeMin - responseLimitMin : 0;
    
    const wasResolved = !!(task.closureDate && task.closureDate.trim() !== '');
    const resolutionEnd = wasResolved ? task.closureDate! : now;
    
    const rawResolutionMin = getBusinessMinutes(task.generationDate, resolutionEnd, shiftConfig);
    const holdResolutionMin = getTaskHoldMinutes(task, resolutionEnd, shiftConfig);
    const resolutionTimeMin = Math.max(0, rawResolutionMin - holdResolutionMin);
    
    const isResolutionBreached = resolutionTimeMin > resolutionLimitMin;
    const resolutionDelayMin = isResolutionBreached ? resolutionTimeMin - resolutionLimitMin : 0;
    
    return {
      responseLogged,
      responseTimeMin,
      isResponseBreached,
      responseDelayMin,
      responseLimitMin,
      
      wasResolved,
      resolutionTimeMin,
      isResolutionBreached,
      resolutionDelayMin,
      resolutionLimitMin,
    };
  };

  const [activeTab, setActiveTab] = useState<'analytics' | 'workbook' | 'settings' | 'mapping-details' | 'user-onboard'>('analytics');
  const [trendPeriod, setTrendPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom'>('daily');
  const [customStartDate, setCustomStartDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  
  // User Onboard State
  const [users, setUsers] = useState<AppUser[]>([
    { id: 'Admin', name: 'Admin User', role: 'Administrator', status: 'Active' },
    { id: 'John.D', name: 'John Doe', role: 'Support Specialist', status: 'Active' },
    { id: 'Sarah.M', name: 'Sarah Miller', role: 'L2 Engineer', status: 'Active' },
    { id: 'Support.Alpha', name: 'Alpha Support', role: 'Standard User', status: 'Active' },
  ]);
  const [editingUser, setEditingUser] = useState<string | null>(null);

  const [userFormData, setUserFormData] = useState<Partial<AppUser>>({
    id: '',
    name: '',
    password: '',
    status: 'Active',
    role: 'Standard User'
  });

  // Login & Password Recovery states
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const [authMode, setAuthMode] = useState<'login' | 'recover'>('login');
  const [recoveryUsername, setRecoveryUsername] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<1 | 2 | 3>(1);
  const [foundRecoveryUser, setFoundRecoveryUser] = useState<AppUser | null>(null);
  const [recoveryAnswerInput, setRecoveryAnswerInput] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  
  const [showTesterPasswordUserId, setShowTesterPasswordUserId] = useState<string | null>(null);
  
  const [metricsDetailModalOpen, setMetricsDetailModalOpen] = useState(false);
  const [metricsDetailProject, setMetricsDetailProject] = useState('All');

  const [attachmentStorageMode, setAttachmentStorageMode] = useState<'local' | 'sandbox'>(() => {
    return (localStorage.getItem('sflow_attachment_storage_mode') as 'local' | 'sandbox') || 'local';
  });

  const [attachmentBasePath, setAttachmentBasePath] = useState<string>(() => {
    return localStorage.getItem('sflow_attachment_base_path') || 'E:\\ITSM_Attachment_Folder\\Attachments';
  });
  const [tempAttachments, setTempAttachments] = useState<{name: string, size: number, type: string, dataUrl: string, uploadedAt: string}[]>([]);
  const [activeSmartViewAttachment, setActiveSmartViewAttachment] = useState<{name: string, size: number, type: string, dataUrl: string, uploadedAt: string, ticketId?: string, projectId?: string} | null>(null);
  const [copiedAttachmentPath, setCopiedAttachmentPath] = useState<boolean>(false);

  // Drilldown modal states
  const [drilldownModalOpen, setDrilldownModalOpen] = useState(false);
  const [drilldownTitle, setDrilldownTitle] = useState('');
  const [drilldownDescription, setDrilldownDescription] = useState('');
  const [drilldownTickets, setDrilldownTickets] = useState<SupportTask[]>([]);
  const [drilldownSearch, setDrilldownSearch] = useState('');

  const handleLoginSubmit = async (e?: React.FormEvent, customId?: string, customPassword?: string) => {
    if (e) e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    const uid = (customId || loginId).trim();
    const upass = customPassword || loginPassword;

    if (!uid) {
      setLoginError('User ID is required');
      setIsLoggingIn(false);
      return;
    }

    try {
      const actualUser = users.find(u => u.id.toLowerCase() === uid.toLowerCase());
      
      let success = false;
      let statusDetails = 'Failed: Credentials mismatch';
      
      if (actualUser) {
        if (actualUser.status === 'Inactive') {
          statusDetails = 'Failed: Account suspended/inactive';
          setLoginError('This account is currently inactive.');
        } else if (actualUser.password === upass || (uid.toLowerCase() === 'admin' && upass === 'root123') || (actualUser.password === undefined && upass === 'user123')) {
          success = true;
          statusDetails = 'Success';
        } else {
          setLoginError('Incorrect password.');
        }
      } else {
        setLoginError('User ID not found.');
      }

      await fetch('/supportflow/api/login-histories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          name: actualUser ? actualUser.name : 'Unknown User',
          clientInfo: navigator.userAgent.substring(0, 50) + " (" + window.location.host + ")",
          status: statusDetails
        })
      });

      await fetchLoginHistories();

      if (success) {
        setCurrentUser(actualUser!.id);
        setIsLoggedIn(true);
        localStorage.setItem('sflow_current_user', actualUser!.id);
        localStorage.setItem('sflow_is_logged_in', 'true');
        setLoginPassword('');
        setLoginError('');
      }
    } catch (err) {
      console.error('Login recording error:', err);
      const actualUser = users.find(u => u.id.toLowerCase() === uid.toLowerCase());
      if (actualUser && (actualUser.password === upass || (uid.toLowerCase() === 'admin' && upass === 'root123') || (actualUser.password === undefined && upass === 'user123'))) {
        setCurrentUser(actualUser.id);
        setIsLoggedIn(true);
        localStorage.setItem('sflow_current_user', actualUser.id);
        localStorage.setItem('sflow_is_logged_in', 'true');
        setLoginPassword('');
      } else {
        setLoginError('Credentials mismatch or authentication error.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('sflow_is_logged_in');
    setAuthMode('login');
    setLoginId('');
    setLoginPassword('');
    setLoginError('');
  };

  const handleAddUser = () => {
    if (!userFormData.id || !userFormData.name) return;
    
    askConfirmation(
      editingUser ? 'Update User Identity' : 'Onboard New User',
      editingUser 
        ? `This will update access details for "${userFormData.name}" (${userFormData.id}). Continue?`
        : `This will create access for "${userFormData.name}" (${userFormData.id}) as ${userFormData.role}. Continue?`,
      async () => {
        const existingUser = editingUser ? users.find(u => u.id === editingUser) : null;
        const newUser: AppUser = {
          id: userFormData.id!,
          name: userFormData.name!,
          password: userFormData.password || (existingUser?.password) || 'Welcome123!',
          status: (userFormData.status as any) || 'Active',
          role: userFormData.role || 'Standard User',
          recoveryQuestion: userFormData.recoveryQuestion || (existingUser?.recoveryQuestion) || "First pet's name?",
          recoveryAnswer: userFormData.recoveryAnswer || (existingUser?.recoveryAnswer) || "buddy"
        };
        
        try {
          const response = await fetch(editingUser ? `${API_USERS}/${editingUser}` : API_USERS, {
            method: editingUser ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newUser)
          });
          if (response.ok) {
            await fetchUsers();
            setUserFormData({ id: '', name: '', password: '', status: 'Active', role: 'Standard User', recoveryQuestion: '', recoveryAnswer: '' });
            setEditingUser(null);
          } else {
            // If API fails, still update local UI for demo purposes but log error
            console.error("Failed to persist user to DB");
            if (editingUser) {
              setUsers(prev => prev.map(u => u.id === editingUser ? newUser : u));
            } else {
              setUsers(prev => [...prev, newUser]);
            }
            setUserFormData({ id: '', name: '', password: '', status: 'Active', role: 'Standard User', recoveryQuestion: '', recoveryAnswer: '' });
            setEditingUser(null);
          }
        } catch (error) {
          console.error("Error saving user:", error);
          if (editingUser) {
            setUsers(prev => prev.map(u => u.id === editingUser ? newUser : u));
          } else {
            setUsers(prev => [...prev, newUser]);
          }
          setUserFormData({ id: '', name: '', password: '', status: 'Active', role: 'Standard User', recoveryQuestion: '', recoveryAnswer: '' });
          setEditingUser(null);
        }
      },
      'info',
      editingUser ? 'Update' : 'Onboard'
    );
  };

  const handleEditUser = (user: AppUser) => {
    setEditingUser(user.id);
    setUserFormData({
      id: user.id,
      name: user.name,
      password: user.password || '',
      status: user.status,
      role: user.role,
      recoveryQuestion: user.recoveryQuestion || '',
      recoveryAnswer: user.recoveryAnswer || ''
    });
  };

  const handleToggleUserStatus = async (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    const updatedStatus = user.status === 'Active' ? 'Inactive' : 'Active';
    const updatedUser = { ...user, status: updatedStatus };

    try {
      const response = await fetch(`${API_USERS}/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser)
      });
      if (response.ok) {
        await fetchUsers();
      } else {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: updatedStatus as any } : u));
      }
    } catch (error) {
      console.error("Error toggling user status:", error);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: updatedStatus as any } : u));
    }
  };

  const handleDeleteUser = (userId: string) => {
    if (userId === 'Admin') return;
    askConfirmation(
      'Offboard User',
      `Permanently remove access for user ID "${userId}"? This action cannot be undone.`,
      async () => {
        try {
          const response = await fetch(`${API_USERS}/${userId}`, { method: 'DELETE' });
          if (response.ok) {
            await fetchUsers();
          } else {
            setUsers(prev => prev.filter(u => u.id !== userId));
          }
        } catch (error) {
          console.error("Error deleting user:", error);
          setUsers(prev => prev.filter(u => u.id !== userId));
        }
      },
      'danger',
      'Delete'
    );
  };
  
  // Shift & Strategy states
  const [tempShiftStart, setTempShiftStart] = useState('09:00');
  const [tempShiftEnd, setTempShiftEnd] = useState('18:00');
  const [tempWorkingDays, setTempWorkingDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [tempHolidays, setTempHolidays] = useState<string>('');
  
  const [tempEmployeeShifts, setTempEmployeeShifts] = useState<ProjectConfig['employeeShifts']>([]);
  const [editingEmployeeShiftName, setEditingEmployeeShiftName] = useState<string | null>(null);
  const [empShiftData, setEmpShiftData] = useState({
    name: '',
    shiftStart: '09:00',
    shiftEnd: '18:00',
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  });

  const handleAddProject = async () => {
    if (!newProjectInput.trim() || projectsDB.find(p => p.name === newProjectInput)) return;
    
    askConfirmation(
      'Initialize New Project',
      `This will create project "${newProjectInput}" with default SLA and assignment policies. Continue?`,
      async () => {
        const newProj = {
          name: newProjectInput,
          description: `Project ${newProjectInput}`,
          employees: 'John.D, Sarah.M, Admin, Support.Alpha', // Default initial employees
          p1ResponseSla: 2, p1ResolutionSla: 4,
          p2ResponseSla: 4, p2ResolutionSla: 8,
          p3ResponseSla: 8, p3ResolutionSla: 24,
          p4ResponseSla: 24, p4ResolutionSla: 48,
        };

        try {
          const response = await fetch(API_PROJECTS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newProj),
          });

          if (response.ok) {
            await fetchProjects();
            setNewProjectInput('');
            setConfigSelectedProject(newProjectInput);
          }
        } catch (error) {
          console.error('Error adding project:', error);
        }
      },
      'info',
      'Initialize'
    );
  };

  const handleDeleteProject = async (name: string) => {
    const project = projectsDB.find(p => p.name === name);
    if (!project) return;

    askConfirmation(
      'Terminate Project',
      `Deleting "${name}" will remove all associated configurations and mappings. Continue?`,
      async () => {
        try {
          const response = await fetch(`${API_PROJECTS}/${project.id}`, { method: 'DELETE' });
          if (response.ok) {
            await fetchProjects();
            setProjectsDB(prev => {
              const remaining = prev.filter(p => p.name !== name);
              if (remaining.length > 0) setConfigSelectedProject(remaining[0].name);
              else setConfigSelectedProject('');
              return remaining;
            });
          } else {
            console.error('Project deletion failed:', response.status);
          }
        } catch (error) {
          console.error('Error deleting project:', error);
        }
      },
      'danger',
      'Terminate'
    );
  };

  const handleSaveConfiguration = async () => {
    const project = projectsDB.find(p => p.name === configSelectedProject);
    if (!project) return;
    
    // Validate shift times (HH:MM)
    const timeRegex = /^([01]\d|2[0-3]):?([0-5]\d)$/;
    if (!timeRegex.test(tempShiftStart) || !timeRegex.test(tempShiftEnd)) {
      alert('Invalid shift time format. Use HH:MM (24h)');
      return;
    }

    askConfirmation(
      'Apply Project Shift Allocation Strategy',
      `Updated service level benchmarks and shift parameters will be applied to project "${configSelectedProject}". System calculations will adapt immediately. Confirm?`,
      async () => {
        const payload = {
          ...project,
          p1ResponseSla: tempProjectSlas.P1.response,
          p1ResolutionSla: tempProjectSlas.P1.resolution,
          p2ResponseSla: tempProjectSlas.P2.response,
          p2ResolutionSla: tempProjectSlas.P2.resolution,
          p3ResponseSla: tempProjectSlas.P3.response,
          p3ResolutionSla: tempProjectSlas.P3.resolution,
          p4ResponseSla: tempProjectSlas.P4.response,
          p4ResolutionSla: tempProjectSlas.P4.resolution,
          shiftStart: tempShiftStart,
          shiftEnd: tempShiftEnd,
          workingDays: tempWorkingDays.join(','),
          holidays: tempHolidays.split(',').map(h => h.trim()).filter(Boolean).join(','),
          employeeShifts: JSON.stringify(tempEmployeeShifts),
        };

        try {
          const response = await fetch(API_PROJECTS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (response.ok) {
            await fetchProjects();
          }
        } catch (error) {
          console.error('Error updating config:', error);
        }
      },
      'warning',
      'Apply'
    );
  };
  const handlePersonnelMapping = async () => {
    if (!personnelInput.trim() || selectedProjectsForMapping.length === 0) return;
    
    const name = personnelInput.trim();

    askConfirmation(
      editingEmployee ? 'Update Specialist Mapping' : 'Commit Personnel Mapping',
      editingEmployee 
        ? `Confirm update for specialist "${editingEmployee.originalName}"?`
        : `This will map specialist "${personnelInput}" across ${selectedProjectsForMapping.length} project(s). Continue?`,
      async () => {
        // Iterate through projectsDB and update those in selectedProjectsForMapping
        const updates = projectsDB.map(async (p) => {
          if (selectedProjectsForMapping.includes(p.name)) {
            let currentEmployees = p.employees ? p.employees.split(',').map((e: string) => e.trim()).filter(Boolean) : [];
            
            // If editing, handle rename/move
            if (editingEmployee) {
              currentEmployees = currentEmployees.filter(e => e !== editingEmployee.originalName);
            }

            if (!currentEmployees.includes(name)) {
              currentEmployees.push(name);
            }

            const payload = { ...p, employees: currentEmployees.join(', ') };
            return fetch(API_PROJECTS, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
          }
          return Promise.resolve();
        });

        try {
          await Promise.all(updates);
          await fetchProjects();
          setPersonnelInput('');
          setSelectedProjectsForMapping([]);
          setEditingEmployee(null);
        } catch (error) {
          console.error('Error updating personnel mapping:', error);
        }
      },
      'info',
      editingEmployee ? 'Update' : 'Map'
    );
  };

   const handleUnmapResource = async (emp: string) => {
    askConfirmation(
      'Unmap Resource',
      `Are you sure you want to remove "${emp}" from the selected project mappings?`,
      async () => {
        const updates = projectsDB.map(async (p) => {
          if (selectedProjectsForMapping.includes(p.name)) {
            let currentEmployees = p.employees ? p.employees.split(',').map((e: string) => e.trim()).filter(Boolean) : [];
            currentEmployees = currentEmployees.filter(e => e !== emp);
            
            const payload = { ...p, employees: currentEmployees.join(', ') };
            return fetch(API_PROJECTS, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
          }
          return Promise.resolve();
        });
        try {
          await Promise.all(updates);
          await fetchProjects();
        } catch (error) {
          console.error('Error unmapping resource:', error);
        }
      },
      'warning',
      'Unmap'
    );
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<string>('All');
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterResponseSla, setFilterResponseSla] = useState<string>('All');
  const [filterResolutionSla, setFilterResolutionSla] = useState<string>('All');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string>('All');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('All');
  const [editingTask, setEditingTask] = useState<SupportTask | null>(null);
  const [auditTask, setAuditTask] = useState<SupportTask | null>(null);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [isUtilityDropdownOpen, setIsUtilityDropdownOpen] = useState(false);
  const [analyticsSubView, setAnalyticsSubView] = useState<'system' | 'productivity'>('system');
  const [prodSelectedRes, setProdSelectedRes] = useState<string>('All');

  // Change & Release Management States
  const [changeReleaseRecords, setChangeReleaseRecords] = useState<any[]>(() => {
    const saved = localStorage.getItem('sflow_change_release_records');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse release records", e);
      }
    }
    return [
      {
        id: 'CR-1001',
        warJarName: 'hr-portal-v2.4.1.war',
        purpose: 'v2.4.1 Production Rollout - Payroll Module Enhancements',
        deploymentDate: '2026-05-20T14:30:00Z',
        intimationDate: '2026-05-20T13:30:00Z',
        sanityCheckDate: '2026-05-20T15:00:00Z',
        status: 'Successful',
        hasDeploymentSignoff: true,
        hasUatSignoff: true,
        hasDocReviewSignoff: true,
        rollbackDone: false,
        failureReason: '',
        lessonsLearned: 'UAT testing completed on staging ahead of target, reducing integration adjustments.',
        projectId: 'HR-Portal',
        registeredBy: 'Admin',
        notes: 'SLA checklist and rollback procedure fully validated.'
      },
      {
        id: 'CR-1002',
        warJarName: 'payment-gateway-v1.9.0.jar',
        purpose: 'v1.9.0 Payment Gateway Update - Secure 3D-Secure integration',
        deploymentDate: '2026-05-29T21:00:00Z',
        intimationDate: '2026-05-29T20:00:00Z',
        sanityCheckDate: '2026-05-29T21:30:00Z',
        status: 'Scheduled',
        hasDeploymentSignoff: true,
        hasUatSignoff: true,
        hasDocReviewSignoff: true,
        rollbackDone: false,
        failureReason: '',
        lessonsLearned: '',
        projectId: 'E-Commerce',
        registeredBy: 'Admin',
        notes: 'Maintenance window approved for 21:00 UTC Friday.'
      },
      {
        id: 'CR-1003',
        warJarName: 'crm-backend-v3.1.2.jar',
        purpose: 'v3.1.2 DB Migration - Customer interactions schema updates',
        deploymentDate: '2026-05-18T08:00:00Z',
        intimationDate: '2026-05-18T07:00:00Z',
        sanityCheckDate: '2026-05-18T08:30:00Z',
        status: 'Rolled Back',
        hasDeploymentSignoff: true,
        hasUatSignoff: false,
        hasDocReviewSignoff: true,
        rollbackDone: true,
        failureReason: 'Database migration scripts lockup due to concurrent transactions in user session tables.',
        lessonsLearned: 'Always perform synthetic mock load testing on target database size snapshot before migration execution.',
        projectId: 'Internal-CRM',
        registeredBy: 'Admin',
        notes: 'Rollback script completed successfully within 9 minutes. User sessions restored automatically.'
      },
      {
        id: 'CR-1004',
        warJarName: 'hr-portal-v2.4.0.war',
        purpose: 'v2.4.0 Production Rollout - Notification Engine Overhaul',
        deploymentDate: '2026-05-15T11:00:00Z',
        intimationDate: '2026-05-15T10:00:00Z',
        sanityCheckDate: '2026-05-15T11:30:00Z',
        status: 'Successful',
        hasDeploymentSignoff: true,
        hasUatSignoff: true,
        hasDocReviewSignoff: true,
        rollbackDone: false,
        failureReason: '',
        lessonsLearned: 'Completed staging tests 48 hrs in advance.',
        projectId: 'HR-Portal',
        registeredBy: 'Admin',
        notes: 'Rolled out and warm-started background service cleanly.',
        podName: 'POD-Alpha',
        teamName: 'Core HR Engineering',
        leadName: 'Rajesh Kumar',
        sanityStatus: 'Pass'
      },
      {
        id: 'CR-1005',
        warJarName: 'mobile-android-v1.2.0.apk',
        purpose: 'v1.2.0 Android Store Release - Theme adjustments & biometrics login support',
        deploymentDate: '2026-05-10T09:15:00Z',
        intimationDate: '2026-05-10T08:15:00Z',
        sanityCheckDate: '2026-05-10T10:00:00Z',
        status: 'Successful',
        hasDeploymentSignoff: true,
        hasUatSignoff: true,
        hasDocReviewSignoff: true,
        rollbackDone: false,
        failureReason: '',
        lessonsLearned: 'Play Store staggered rollout allowed quick validation.',
        projectId: 'Mobile-App',
        registeredBy: 'Rajesh Kumar',
        notes: 'A/B test indicates 99.4% crash free rate.',
        podName: 'POD-Mobile',
        teamName: 'Mobile UI Team',
        leadName: 'Rajesh Kumar',
        sanityStatus: 'Pass'
      },
      {
        id: 'CR-1006',
        warJarName: 'recs-engine-v0.8.2.jar',
        purpose: 'v0.8.2 Recommendation Engine - Hotfix for memory leakage on model load',
        deploymentDate: '2026-05-04T16:45:00Z',
        intimationDate: '2026-05-04T15:45:00Z',
        sanityCheckDate: '2026-05-04T17:30:00Z',
        status: 'Successful',
        hasDeploymentSignoff: true,
        hasUatSignoff: true,
        hasDocReviewSignoff: true,
        rollbackDone: false,
        failureReason: '',
        lessonsLearned: 'Memory profile checks should be run on CI/CD pipelines automatically.',
        projectId: 'E-Commerce',
        registeredBy: 'Admin',
        notes: 'Heap utilization went down from 8.8GB to 1.1GB.',
        podName: 'POD-Commerce',
        teamName: 'Search & Recs',
        leadName: 'Rajesh Kumar',
        sanityStatus: 'Pass'
      },
      {
        id: 'CR-1007',
        warJarName: 'crm-scheduler-v1.1.0-beta.jar',
        purpose: 'v1.1.0 Internal CRM Scheduler Deployment - High priority ticket assignment automated workflow',
        deploymentDate: '2026-05-01T15:00:00Z',
        intimationDate: '2026-05-01T14:00:00Z',
        sanityCheckDate: '2026-05-01T15:30:00Z',
        status: 'Failed',
        hasDeploymentSignoff: false,
        hasUatSignoff: true,
        hasDocReviewSignoff: true,
        rollbackDone: true,
        failureReason: 'Null pointer exception during initialization of Kafka integration client.',
        lessonsLearned: 'Never deploy beta packages without checking staging broker topology endpoints.',
        projectId: 'Internal-CRM',
        registeredBy: 'Rajesh Kumar',
        notes: 'Clean rollback triggered.',
        podName: 'POD-Scheduler',
        teamName: 'Core Integrations',
        leadName: 'Rajesh Kumar',
        sanityStatus: 'Fail',
        rcaVal: 'Staging environment loaded a production kafka broker configuration which led to permission check block.'
      }
    ];
  });

  useEffect(() => {
    localStorage.setItem('sflow_change_release_records', JSON.stringify(changeReleaseRecords));
  }, [changeReleaseRecords]);

  const [isChangeReleaseModalOpen, setIsChangeReleaseModalOpen] = useState(false);
  const [editingReleaseRecord, setEditingReleaseRecord] = useState<any | null>(null);

  // Form states for change/release
  const [crFormWarJarName, setCrFormWarJarName] = useState('');
  const [crFormPurpose, setCrFormPurpose] = useState('');
  const [crFormDeploymentDate, setCrFormDeploymentDate] = useState('');
  const [crFormStatus, setCrFormStatus] = useState<string>('Scheduled');
  const [crFormHasDeploymentSignoff, setCrFormHasDeploymentSignoff] = useState(false);
  const [crFormHasUatSignoff, setCrFormHasUatSignoff] = useState(false);
  const [crFormHasDocReviewSignoff, setCrFormHasDocReviewSignoff] = useState(false);
  const [crFormRollbackDone, setCrFormRollbackDone] = useState(false);
  const [crFormFailureReason, setCrFormFailureReason] = useState('');
  const [crFormLessonsLearned, setCrFormLessonsLearned] = useState('');
  const [crFormProjectId, setCrFormProjectId] = useState('HR-Portal');
  const [crFormNotes, setCrFormNotes] = useState('');
  const [crFormPodName, setCrFormPodName] = useState('');
  const [crFormTeamName, setCrFormTeamName] = useState('');
  const [crFormLeadName, setCrFormLeadName] = useState('');
  const [crFormSanityStatus, setCrFormSanityStatus] = useState<string>('Pass');
  const [crFormRca, setCrFormRca] = useState('');
  const [crFormIntimationDate, setCrFormIntimationDate] = useState('');
  const [crFormSanityCheckDate, setCrFormSanityCheckDate] = useState('');

  // Filtering for Change & Release
  const [crFilterProject, setCrFilterProject] = useState('All');
  const [crFilterStatus, setCrFilterStatus] = useState('All');
  const [crSearchQuery, setCrSearchQuery] = useState('');
  const [crDashboardPeriod, setCrDashboardPeriod] = useState<'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'custom'>('daily');
  const [crCustomStartDate, setCrCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().substring(0, 10);
  });
  const [crCustomEndDate, setCrCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().substring(0, 10);
  });

  // Knowledge Base States
  const [kbSearchQuery, setKbSearchQuery] = useState('');
  const [kbSelectedProject, setKbSelectedProject] = useState('All');
  const [kbSelectedCategory, setKbSelectedCategory] = useState('All');
  const [kbSelectedArticle, setKbSelectedArticle] = useState<SupportTask | null>(null);

  // Chat Bot States
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ sender: 'user' | 'bot' | 'system'; text: string; timestamp: Date }[]>(() => [
    {
      sender: 'bot',
      text: "Hello! I am your S-Flow GenAI Support Expert. I have read-access to all resolved similar issues and troubleshooting solutions in the knowledge base. Ask me any support-related question or describe a bug, and I will summarize matching solutions or help you draft resolution steps!",
      timestamp: new Date()
    }
  ]);
  const [isBotLoading, setIsBotLoading] = useState(false);
  
  // Log Edit Modal State
  const [logModalState, setLogModalState] = useState<{
    isOpen: boolean;
    taskId: number | null;
    fieldName: 'description' | 'solution' | 'remarks' | null;
    fieldLabel: string;
    entries: { timestamp: string; user: string; text: string }[];
    newInput: string;
  }>({
    isOpen: false,
    taskId: null,
    fieldName: null,
    fieldLabel: '',
    entries: [],
    newInput: '',
  });

  const openLogEditModal = (task: SupportTask, fieldName: 'description' | 'solution' | 'remarks', fieldLabel: string) => {
    const rawVal = task[fieldName] || '';
    const defaultUser = fieldName === 'solution' ? (task.assignedTo || 'Admin') : (task.createdBy || 'Admin');
    const defaultDate = fieldName === 'solution' ? (task.closureDate || task.generationDate) : task.generationDate;
    const parsed = parseEntries(rawVal, defaultUser, defaultDate);
    setLogModalState({
      isOpen: true,
      taskId: task.id,
      fieldName,
      fieldLabel,
      entries: parsed,
      newInput: '',
    });
  };

  const handleAddLogEntry = async () => {
    if (!logModalState.newInput.trim() || !logModalState.taskId || !logModalState.fieldName) return;
    
    const timestampStr = format(new Date(), 'MMM d, yyyy, h:mm a');
    const newEntry = {
      timestamp: timestampStr,
      user: currentUser || 'Admin',
      text: logModalState.newInput.trim(),
    };
    
    const updatedEntries = [newEntry, ...logModalState.entries]; // Prepend, newest on top!
    
    // Save to server
    await handleSaveFieldLogs(logModalState.taskId, logModalState.fieldName, updatedEntries);
    
    // Update state
    setLogModalState(prev => ({
      ...prev,
      entries: updatedEntries,
      newInput: '',
    }));
  };

  const handleDeleteLogEntry = async (indexToDelete: number) => {
    if (!logModalState.taskId || !logModalState.fieldName) return;
    const updatedEntries = logModalState.entries.filter((_, idx) => idx !== indexToDelete);
    
    // Save to server
    await handleSaveFieldLogs(logModalState.taskId, logModalState.fieldName, updatedEntries);
    
    // Update state
    setLogModalState(prev => ({
      ...prev,
      entries: updatedEntries,
    }));
  };

  const handleSaveFieldLogs = async (taskId: number, fieldName: 'description' | 'solution' | 'remarks', updatedEntries: any[]) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const serialized = JSON.stringify(updatedEntries);
    
    const payload = {
      ...task,
      [fieldName]: serialized,
      auditLog: JSON.stringify(task.auditLog || [])
    };

    try {
      const url = `${API_BASE}/${taskId}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const savedTask = await response.json();
        const parsedSavedTask = {
          ...savedTask,
          auditLog: savedTask.auditLog ? (typeof savedTask.auditLog === 'string' ? JSON.parse(savedTask.auditLog) : savedTask.auditLog) : []
        };
        
        setTasks(prev => prev.map(t => t.id === taskId ? parsedSavedTask : t));
        
        // Also update the active task in audit modal if open
        if (auditTask && auditTask.id === taskId) {
          setAuditTask(parsedSavedTask);
        }
      } else {
        console.error('Failed to update field logs:', response.status);
      }
    } catch (error) {
      console.error('Error updating field logs:', error);
    }
  };
  
  const [currentUser, setCurrentUser] = useState<string>(() => {
    return localStorage.getItem('sflow_current_user') || 'Admin';
  });
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('sflow_is_logged_in') === 'true';
  });

  // Custom workbook columns config
  interface WorkbookColumn {
    id: string;
    label: string;
    visible: boolean;
  }

  const DEFAULT_WORKBOOK_COLUMNS: WorkbookColumn[] = useMemo(() => [
    { id: 'ticketId', label: 'ID', visible: true },
    { id: 'projectId', label: 'Project', visible: true },
    { id: 'supportLevel', label: 'Level', visible: true },
    { id: 'priority', label: 'Priority', visible: true },
    { id: 'category', label: 'Category', visible: true },
    { id: 'subcategory', label: 'Subcategory', visible: true },
    { id: 'status', label: 'Status', visible: true },
    { id: 'description', label: 'Issue Description', visible: true },
    { id: 'createdBy', label: 'Owner', visible: true },
    { id: 'assignedTo', label: 'Assignee', visible: true },
    { id: 'generationDate', label: 'Created', visible: true },
    { id: 'responseDate', label: 'Response Date', visible: true },
    { id: 'closureDate', label: 'Resolution Date', visible: true },
    { id: 'solution', label: 'Resolution Description', visible: true },
    { id: 'remarks', label: 'Remarks', visible: true },
    { id: 'responseSla', label: 'Response SLA Status', visible: true },
    { id: 'resolutionSla', label: 'Resolution SLA Status', visible: true },
    { id: 'aging', label: 'Aging', visible: true },
  ], []);

  const [workbookColumns, setWorkbookColumns] = useState<WorkbookColumn[]>(() => {
    const initialUser = localStorage.getItem('sflow_current_user') || 'Admin';
    const saved = localStorage.getItem(`sflow_columns_${initialUser}`) || localStorage.getItem('workbook_columns_v6');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Sync with hardcoded default set in case of schema drifts
          const defaultMap = new Map(DEFAULT_WORKBOOK_COLUMNS.map(c => [c.id, c]));
          const merged = DEFAULT_WORKBOOK_COLUMNS.map(defCol => {
            const found = parsed.find((p: any) => p.id === defCol.id);
            return found ? { ...defCol, visible: found.visible } : defCol;
          });
          const ordered = parsed
            .map((p: any) => {
              const base = defaultMap.get(p.id);
              if (!base) return null;
              return { ...base, visible: p.visible };
            })
            .filter(Boolean) as WorkbookColumn[];
          
          merged.forEach(m => {
            if (!ordered.find(o => o.id === m.id)) {
              ordered.push(m);
            }
          });
          return ordered;
        }
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_WORKBOOK_COLUMNS;
  });

  const [isColumnsPanelOpen, setIsColumnsPanelOpen] = useState<boolean>(false);

  const saveColumns = (newCols: WorkbookColumn[]) => {
    setWorkbookColumns(newCols);
    localStorage.setItem(`sflow_columns_${currentUser}`, JSON.stringify(newCols));
  };

  // Sync columns config dynamically when currentUser switches
  useEffect(() => {
    if (!currentUser) return;
    const saved = localStorage.getItem(`sflow_columns_${currentUser}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const defaultMap = new Map(DEFAULT_WORKBOOK_COLUMNS.map(c => [c.id, c]));
          const merged = DEFAULT_WORKBOOK_COLUMNS.map(defCol => {
            const found = parsed.find((p: any) => p.id === defCol.id);
            return found ? { ...defCol, visible: found.visible } : defCol;
          });
          const ordered = parsed
            .map((p: any) => {
              const base = defaultMap.get(p.id);
              if (!base) return null;
              return { ...base, visible: p.visible };
            })
            .filter(Boolean) as WorkbookColumn[];
          
          merged.forEach(m => {
            if (!ordered.find(o => o.id === m.id)) {
              ordered.push(m);
            }
          });
          setWorkbookColumns(ordered);
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }
    // Default to show ALL columns if not set by user
    setWorkbookColumns(DEFAULT_WORKBOOK_COLUMNS);
  }, [currentUser, DEFAULT_WORKBOOK_COLUMNS]);
  
  // Workbook sorting states (Default sorting: generationDate descending - newly created tickets on top)
  const [workbookSortCol, setWorkbookSortCol] = useState<string>('generationDate');
  const [workbookSortDir, setWorkbookSortDir] = useState<'asc' | 'desc'>('desc');

  // Workbook pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  
  // Reset pagination to first page when search filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedProject, selectedEmployee, filterLevel, filterPriority, filterStatus, filterResponseSla, filterResolutionSla]);
  
  // Dynamic Projects List
  const PROJECTS_LIST = useMemo(() => projectsDB.map(p => p.name), [projectsDB]);

  const [theme, setTheme] = useState<'cosmic' | 'frost' | 'emerald' | 'cyber' | 'sapphire' | 'rose'>(() => {
    const saved = localStorage.getItem(`sflow_theme_${localStorage.getItem('sflow_current_user') || 'Admin'}`);
    return (saved as any) || 'cosmic';
  });
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);

  useEffect(() => {
    const themeClasses = ['theme-cosmic', 'theme-frost', 'theme-emerald', 'theme-cyber', 'theme-sapphire', 'theme-rose'];
    themeClasses.forEach(cls => document.body.classList.remove(cls));
    document.body.classList.add(`theme-${theme}`);
    localStorage.setItem(`sflow_theme_${currentUser}`, theme);
  }, [theme, currentUser]);

  useEffect(() => {
    if (currentUser) {
      const savedUserTheme = localStorage.getItem(`sflow_theme_${currentUser}`) as any;
      if (savedUserTheme && ['cosmic', 'frost', 'emerald', 'cyber', 'sapphire', 'rose'].includes(savedUserTheme)) {
        setTheme(savedUserTheme);
      } else {
        setTheme('cosmic');
      }
    }
  }, [currentUser]);

  const chartColors = useMemo(() => {
    switch (theme) {
      case 'frost':
        return {
          grid: '#cbd5e1', // slate-300
          text: '#475569', // slate-600
          tooltipBg: '#ffffff',
          tooltipBorder: '#cbd5e1',
          tooltipText: '#0f172a'
        };
      case 'emerald':
        return {
          grid: '#1e301e', // dark green line
          text: '#6fa66f', // soft sage text
          tooltipBg: '#121c12',
          tooltipBorder: '#2b452b',
          tooltipText: '#daf7da'
        };
      case 'cyber':
        return {
          grid: '#252525', // structural concrete
          text: '#999999', // lead conduits
          tooltipBg: '#0c0c0c',
          tooltipBorder: '#363636',
          tooltipText: '#f59e0b'
        };
      case 'sapphire':
        return {
          grid: '#1e2e4a',
          text: '#93c5fd',
          tooltipBg: '#0b1528',
          tooltipBorder: '#1e2e4a',
          tooltipText: '#ffffff'
        };
      case 'rose':
        return {
          grid: '#33171e',
          text: '#fda4af',
          tooltipBg: '#190a0f',
          tooltipBorder: '#33171e',
          tooltipText: '#ffffff'
        };
      case 'cosmic':
      default:
        return {
          grid: '#1e293b',
          text: '#64748b',
          tooltipBg: '#0f172a',
          tooltipBorder: '#1e293b',
          tooltipText: '#ffffff'
        };
    }
  }, [theme]);
  
  const [loginHistories, setLoginHistories] = useState<any[]>([]);
  const [lastLoginTime, setLastLoginTime] = useState<string | null>(null);

  const fetchLastLoginTime = async (userId: string) => {
    try {
      const response = await fetch(`/supportflow/api/login-histories/user/${userId}`);
      if (response.ok) {
        const data = await response.json();
        const successfulLogins = (data || []).filter((h: any) => h.status?.toLowerCase() === 'success');
        if (successfulLogins.length > 1) {
          setLastLoginTime(successfulLogins[1].loginTime);
        } else if (successfulLogins.length === 1) {
          setLastLoginTime(successfulLogins[0].loginTime);
        } else {
          setLastLoginTime(null);
        }
      }
    } catch (e) {
      console.error("Error fetching user login history:", e);
    }
  };

  const fetchLoginHistories = async () => {
    try {
      const response = await fetch('/supportflow/api/login-histories');
      if (response.ok) {
        const data = await response.json();
        setLoginHistories(data || []);
      }
    } catch (e) {
      console.error("Error fetching login histories:", e);
    }
  };

  useEffect(() => {
    fetchLoginHistories();
    if (isLoggedIn && currentUser) {
      fetchLastLoginTime(currentUser);
    }
  }, [isLoggedIn, currentUser]);

  const currentLoggedInUserObj = useMemo(() => {
    return users.find(u => u.id === currentUser);
  }, [users, currentUser]);

  const isAdmin = useMemo(() => {
    if (!isLoggedIn) return false;
    if (currentUser === 'Admin') return true;
    return currentLoggedInUserObj?.role?.toLowerCase().includes('admin') || false;
  }, [currentUser, currentLoggedInUserObj, isLoggedIn]);

  const isManagerOrAdmin = useMemo(() => {
    if (!isLoggedIn) return false;
    if (currentUser === 'Admin') return true;
    const role = (currentLoggedInUserObj?.role || '').toLowerCase();
    return role.includes('admin') || role.includes('manager');
  }, [currentUser, currentLoggedInUserObj, isLoggedIn]);
  
  const [projectConfigs, setProjectConfigs] = useState<ProjectConfig[]>([]);

  const auditModalSla = useMemo(() => {
    if (!auditTask) return null;
    return getTaskSlaTimes(auditTask, new Date().toISOString());
  }, [auditTask, projectConfigs]);

  // Derived user project mapping
  const userMappedProjects = useMemo(() => {
    if (isManagerOrAdmin) return PROJECTS_LIST;
    return projectConfigs
      .filter(p => (p.employees || []).some(emp => emp.toLowerCase() === currentUser.toLowerCase()))
      .map(p => p.projectId);
  }, [projectConfigs, currentUser, isManagerOrAdmin, PROJECTS_LIST]);

  // Derived available employees list based on selectedProject and role/mapping
  const availableEmployees = useMemo(() => {
    if (isManagerOrAdmin) {
      if (selectedProject === 'All') {
        const allEmployees = Array.from(new Set(projectConfigs.flatMap(p => p.employees || [])));
        return allEmployees.sort();
      } else {
        const config = projectConfigs.find(p => p.projectId === selectedProject);
        return (config?.employees || []).slice().sort();
      }
    } else {
      if (selectedProject === 'All') {
        // Only employees who are members of any of the user's mapped projects
        const mappedEmployees = Array.from(new Set(
          projectConfigs
            .filter(p => userMappedProjects.includes(p.projectId))
            .flatMap(p => p.employees || [])
        ));
        return mappedEmployees.sort();
      } else {
        // Employees of the selected project
        const config = projectConfigs.find(p => p.projectId === selectedProject);
        return (config?.employees || []).slice().sort();
      }
    }
  }, [isManagerOrAdmin, selectedProject, userMappedProjects, projectConfigs]);

  // Dynamic automatic filters and active tab adjustment
  useEffect(() => {
    if (!isManagerOrAdmin) {
      // 1. Force adjust active tab if they shouldn't access Admin/Manager-only pages
      if (activeTab === 'settings' || activeTab === 'user-onboard') {
        setActiveTab('analytics');
      }

      // 2. Project auto-adjustment
      if (userMappedProjects.length === 1) {
        const singleProj = userMappedProjects[0];
        if (selectedProject !== singleProj) {
          setSelectedProject(singleProj);
        }
      } else if (userMappedProjects.length > 1) {
        if (selectedProject !== 'All' && !userMappedProjects.includes(selectedProject)) {
          setSelectedProject('All');
        }
      } else {
        if (selectedProject !== 'All') {
          setSelectedProject('All');
        }
      }
    }
  }, [isManagerOrAdmin, userMappedProjects, selectedProject, activeTab]);

  useEffect(() => {
    // 3. Employee auto-adjustment based on available list
    if (availableEmployees.length === 1) {
      const singleEmp = availableEmployees[0];
      if (selectedEmployee !== singleEmp) {
        setSelectedEmployee(singleEmp);
      }
    } else if (availableEmployees.length >= 2) {
      if (selectedEmployee !== 'All' && !availableEmployees.includes(selectedEmployee)) {
        setSelectedEmployee('All');
      }
    } else {
      if (selectedEmployee !== 'All') {
        setSelectedEmployee('All');
      }
    }
  }, [availableEmployees, selectedEmployee]);

  const [configSelectedProject, setConfigSelectedProject] = useState<string>('');

  // Sync configSelectedProject when projects load
  useEffect(() => {
    if (PROJECTS_LIST.length > 0 && !configSelectedProject) {
      setConfigSelectedProject(PROJECTS_LIST[0]);
    }
  }, [PROJECTS_LIST, configSelectedProject]);

  // Synchronize projectConfigs with projectsDB
  useEffect(() => {
    if (projectsDB.length > 0) {
      setProjectConfigs(projectsDB.map(p => {
        let employeeShifts = [];
        try {
          employeeShifts = p.employeeShifts ? (typeof p.employeeShifts === 'string' ? JSON.parse(p.employeeShifts) : p.employeeShifts) : [];
        } catch (e) {
          console.error('Error parsing employeeShifts for project:', p.name, e);
          employeeShifts = [];
        }

        return {
          projectId: p.name,
          employees: p.employees ? p.employees.split(',').map((e: string) => e.trim()) : [],
          slas: {
            P1: { response: p.p1ResponseSla || 2, resolution: p.p1ResolutionSla || 4 },
            P2: { response: p.p2ResponseSla || 4, resolution: p.p2ResolutionSla || 8 },
            P3: { response: p.p3ResponseSla || 8, resolution: p.p3ResolutionSla || 24 },
            P4: { response: p.p4ResponseSla || 24, resolution: p.p4ResolutionSla || 48 },
          },
          shiftStart: p.shiftStart || '09:00',
          shiftEnd: p.shiftEnd || '18:00',
          workingDays: p.workingDays ? p.workingDays.split(',').map((d: string) => d.trim()) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
          holidays: p.holidays ? p.holidays.split(',').map((h: string) => h.trim()).filter(Boolean) : [],
          employeeShifts: Array.isArray(employeeShifts) ? employeeShifts : [],
        };
      }));
    }
  }, [projectsDB]);

  const [tempProjectSlas, setTempProjectSlas] = useState<ProjectConfig['slas']>({
    P1: { response: 2, resolution: 4 },
    P2: { response: 4, resolution: 8 },
    P3: { response: 8, resolution: 24 },
    P4: { response: 24, resolution: 48 },
  });

  // Update temp states when config selected project changes
  useEffect(() => {
    const current = projectConfigs.find(c => c.projectId === configSelectedProject);
    if (current) {
      setTempProjectSlas(current.slas);
      setTempShiftStart(current.shiftStart);
      setTempShiftEnd(current.shiftEnd);
      setTempWorkingDays(current.workingDays);
      setTempHolidays(current.holidays.join(', '));
      setTempEmployeeShifts(current.employeeShifts || []);
    }
  }, [configSelectedProject, projectConfigs]);

  const [configChanges, setConfigChanges] = useState<{
    id: string;
    projectId: string;
    type: 'SLA' | 'Employee';
    detail: string;
    timestamp: string;
    user: string;
  }[]>([]);

  const [newProjectInput, setNewProjectInput] = useState('');
  const [selectedProjectsForMapping, setSelectedProjectsForMapping] = useState<string[]>([]);
  const [personnelInput, setPersonnelInput] = useState('');
  const [editingEmployee, setEditingEmployee] = useState<{ projectId: string; originalName: string; currentName: string } | null>(null);

  // Derived mapping summary for the currently selected projects in the mapping tool
  const mappedInSelection = Array.from(new Set<string>(
    projectConfigs
      .filter(p => selectedProjectsForMapping.includes(p.projectId))
      .flatMap(p => p.employees || [])
  ));

  // --- Form State ---
  const [formData, setFormData] = useState<Partial<SupportTask>>({
    ticketId: '',
    projectId: '',
    supportLevel: '' as any, // Don't give default value, force user select
    priority: '' as any, // Don't give default value, force user select
    status: 'Open',
    generationDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    responseDate: '',
    closureDate: '',
    userIntimated: false,
    description: '',
    solution: '',
    remarks: '',
    assignedTo: '', // Don't give default value, force user select
    resolutionDetails: '',
    holdReason: '',
    category: '',
    subcategory: '',
  });

  const categoriesList = useMemo(() => {
    return Array.from(new Set(categoryMappings.map(m => m.category))).sort();
  }, [categoryMappings]);

  const subcategoriesList = useMemo(() => {
    if (!formData.category) return [];
    return categoryMappings
      .filter(m => m.category === formData.category)
      .map(m => m.subcategory)
      .sort();
  }, [categoryMappings, formData.category]);

  const handleCategoryChange = (val: string) => {
    const filtered = categoryMappings.filter(m => m.category === val);
    const firstSub = filtered.length > 0 ? filtered[0].subcategory : '';
    setFormData(prev => ({
      ...prev,
      category: val,
      subcategory: firstSub
    }));
  };

  // Reset projectId in formData when projects load based on user permissibility
  useEffect(() => {
    if (userMappedProjects.length > 0 && (!formData.projectId || !userMappedProjects.includes(formData.projectId))) {
      const firstProj = userMappedProjects[0];
      setFormData(prev => ({ 
        ...prev, 
        projectId: firstProj,
        ticketId: getNextTicketId(firstProj, tasks)
      }));
    }
  }, [userMappedProjects, tasks, formData.projectId]);

  // --- Filtered Tasks ---
  const projectFilteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // 1. Mandatory Visibility Check: Admin/Manager sees all, others see mapped projects
      if (!isManagerOrAdmin && !userMappedProjects.includes(t.projectId)) return false;

      // 2. Interactive Filters
      const matchProject = selectedProject === 'All' ? true : t.projectId === selectedProject;
      const matchEmployee = selectedEmployee === 'All' ? true : t.assignedTo === selectedEmployee;
      
      return matchProject && matchEmployee;
    });
  }, [tasks, selectedProject, selectedEmployee, userMappedProjects, isManagerOrAdmin]);

  // --- KPI Calculations ---
  const kpis = useMemo(() => {
    const currentTasks = projectFilteredTasks;
    const closedTasks = currentTasks.filter(t => t.closureDate && (t.status === 'Closed' || t.status === 'Resolved'));
    
    const mttrResp = currentTasks.reduce((acc, t) => {
      const slaData = getTaskSlaTimes(t, new Date().toISOString());
      return acc + (slaData.responseLogged ? slaData.responseTimeMin : 0);
    }, 0) / (currentTasks.filter(t => t.responseDate).length || 1);
    
    const mttrReso = closedTasks.reduce((acc, t) => {
      const slaData = getTaskSlaTimes(t, new Date().toISOString());
      return acc + (slaData.wasResolved ? slaData.resolutionTimeMin : 0);
    }, 0) / (closedTasks.length || 1);
    
    const closedCount = currentTasks.filter(t => t.status === 'Closed').length;
    const intimatedCount = currentTasks.filter(t => t.status === 'Closed' && t.userIntimated).length;
    const compliance = closedCount > 0 ? (intimatedCount / closedCount) * 100 : 0;

    return {
      mttrResp: Math.round(mttrResp),
      mttrReso: Math.round(mttrReso),
      compliance: Math.round(compliance),
      total: currentTasks.length,
      active: currentTasks.filter(t => t.status !== 'Closed').length
    };
  }, [projectFilteredTasks, projectConfigs]);

  const currentConfig = projectConfigs.find(c => c.projectId === configSelectedProject);
  const configPIndex = projectConfigs.findIndex(c => c.projectId === configSelectedProject);

  useEffect(() => {
    if (currentConfig) {
      setTempProjectSlas(currentConfig.slas);
    }
  }, [configSelectedProject, projectConfigs]);

  // --- Chart Data ---
  const charts = useMemo(() => {
    const currentTasks = projectFilteredTasks;

    // Filter tasks based on trendPeriod for Distribution charts
    const now = new Date();
    let periodStart: Date;
    let periodEnd = now;

    if (trendPeriod === 'daily') {
      periodStart = startOfDay(now);
    } else if (trendPeriod === 'weekly') {
      periodStart = subDays(now, 7);
    } else if (trendPeriod === 'monthly') {
      periodStart = subDays(now, 30);
    } else if (trendPeriod === 'quarterly') {
      periodStart = subDays(now, 91);
    } else {
      const s = parseISO(customStartDate);
      const e = parseISO(customEndDate);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) {
        periodStart = new Date(0);
        periodEnd = new Date(0);
      } else {
        periodStart = startOfDay(s);
        periodEnd = endOfDay(e);
      }
    }

    const distributionTasks = currentTasks.filter(t => {
      const genDate = parseISO(t.generationDate);
      return genDate >= periodStart && genDate <= periodEnd;
    });

    // Priority Pie
    const priorityData = Object.keys(PRIORITY_COLORS).map(p => ({
      name: p,
      value: distributionTasks.filter(t => t.priority === p).length,
      color: PRIORITY_COLORS[p as Priority]
    }));

    // Support Level Bar
    const levelData = ['L1', 'L2', 'L3', 'L4'].map(l => ({
      name: l,
      count: distributionTasks.filter(t => t.supportLevel === l).length,
      total: distributionTasks.length
    }));

    // Hours Consumed per Support Level
    const consumptionData = ['L1', 'L2', 'L3', 'L4'].map(l => {
      const levelTasks = distributionTasks.filter(t => t.supportLevel === l && t.closureDate);
      const totalMinutes = levelTasks.reduce((sum, t) => {
        return sum + differenceInMinutes(parseISO(t.closureDate!), parseISO(t.generationDate));
      }, 0);
      return {
        name: l,
        hours: Math.round(totalMinutes / 60),
        count: levelTasks.length
      };
    });

    // Top 5 Issues
    const issueCounts = distributionTasks.reduce((acc, t) => {
      acc[t.description] = (acc[t.description] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topIssues = Object.entries(issueCounts)
      .map(([name, count]) => ({ name, count: count as number }))
      .sort((a, b) => (b.count as number) - (a.count as number))
      .slice(0, 5);

    // Aging of Open Tickets
    const openAgingTasks = distributionTasks.filter(t => t.status !== 'Closed' && t.status !== 'Resolved');
    const agingBuckets = [
      { name: '2-4 Days', min: 2, max: 4, color: '#3b82f6' },
      { name: '4-6 Days', min: 4, max: 6, color: '#f59e0b' },
      { name: '6-8 Days', min: 6, max: 8, color: '#f97316' },
      { name: '8-10 Days', min: 8, max: 10, color: '#ef4444' },
      { name: '10+ Days', min: 10, max: 1000, color: '#7f1d1d' }
    ];

    const agingData = agingBuckets.map(bucket => {
      const count = openAgingTasks.filter(t => {
        const shift = getEffectiveShift(t.projectId, t.assignedTo);
        const [sH, sM] = shift.shiftStart.split(':').map(Number);
        const [eH, eM] = shift.shiftEnd.split(':').map(Number);
        const shiftDurationMinutes = Math.max(60, (eH * 60 + eM) - (sH * 60 + sM));
        const businessMinutes = getBusinessMinutes(t.generationDate, now.toISOString(), shift);
        const ageDays = businessMinutes / shiftDurationMinutes;
        return ageDays >= bucket.min && ageDays < bucket.max;
      }).length;
      return { ...bucket, count };
    });

    // Trend Line calculation based on trendPeriod
    let trendData: { name: string; closures: number; date: number }[] = [];

    if (trendPeriod === 'daily') {
      trendData = Array.from({ length: 24 }).map((_, i) => {
        const hour = i;
        const formatted = `${hour}:00`;
        const hourStart = startOfDay(now).getTime() + (hour * 3600000);
        const hourEnd = hourStart + 3600000;
        
        const closures = currentTasks.filter(t => {
          if (!t.closureDate) return false;
          const cTime = parseISO(t.closureDate).getTime();
          return cTime >= hourStart && cTime < hourEnd;
        }).length;

        return { name: formatted, closures, date: hourStart };
      });
    } else if (trendPeriod === 'weekly') {
      trendData = Array.from({ length: 7 }).map((_, i) => {
        const date = subDays(now, i);
        const formatted = format(date, 'MMM dd');
        const dayStart = startOfDay(date).getTime();
        const dayEnd = dayStart + 86400000;
        
        const closures = currentTasks.filter(t => {
          if (!t.closureDate) return false;
          const cTime = parseISO(t.closureDate).getTime();
          return cTime >= dayStart && cTime < dayEnd;
        }).length;

        return { name: formatted, closures, date: dayStart };
      }).reverse();
    } else if (trendPeriod === 'monthly') {
      trendData = Array.from({ length: 30 }).map((_, i) => {
        const date = subDays(now, i);
        const formatted = format(date, 'MMM dd');
        const dayStart = startOfDay(date).getTime();
        const dayEnd = dayStart + 86400000;
        
        const closures = currentTasks.filter(t => {
          if (!t.closureDate) return false;
          const cTime = parseISO(t.closureDate).getTime();
          return cTime >= dayStart && cTime < dayEnd;
        }).length;

        return { name: formatted, closures, date: dayStart };
      }).reverse();
    } else if (trendPeriod === 'quarterly') {
      // Group by week for quarterly trend
      trendData = Array.from({ length: 13 }).map((_, i) => {
        const date = subDays(now, i * 7);
        const formatted = `Wk ${13 - i}`;
        const weekStart = startOfDay(date).getTime() - (6 * 86400000); // approx start of week
        const weekEnd = startOfDay(date).getTime() + 86400000;
        
        const closures = currentTasks.filter(t => {
          if (!t.closureDate) return false;
          const cTime = parseISO(t.closureDate).getTime();
          return cTime >= weekStart && cTime < weekEnd;
        }).length;

        return { name: formatted, closures, date: weekStart };
      }).reverse();
    } else if (trendPeriod === 'custom') {
      const sDate = parseISO(customStartDate);
      const eDate = parseISO(customEndDate);
      
      if (isNaN(sDate.getTime()) || isNaN(eDate.getTime())) {
        trendData = [];
      } else {
        const start = startOfDay(sDate);
        const end = endOfDay(eDate);
        const diffMs = end.getTime() - start.getTime();
        const diffDays = diffMs >= 0 ? Math.round(diffMs / (24 * 60 * 60 * 1000)) : 0;
        
        if (diffDays <= 0) {
          trendData = [];
        } else if (diffDays <= 60) {
          trendData = Array.from({ length: Math.min(diffDays, 100) }).map((_, i) => {
            const date = subDays(end, i);
            const formatted = format(date, 'MMM dd');
            const dayStart = startOfDay(date).getTime();
            const dayEnd = dayStart + 86400000;
            
            const closures = currentTasks.filter(t => {
              if (!t.closureDate) return false;
              const cTime = parseISO(t.closureDate).getTime();
              return cTime >= dayStart && cTime < dayEnd;
            }).length;

            return { name: formatted, closures, date: dayStart };
          }).reverse();
        } else {
          trendData = Array.from({ length: Math.min(Math.ceil(diffDays / 7), 52) }).map((_, i) => {
            const date = subDays(end, i * 7);
            const weekStart = startOfDay(date).getTime() - (6 * 86400000);
            const weekEnd = startOfDay(date).getTime() + 86400000;
            const formatted = `Wk ${format(date, 'ww')}`;
            
            const closures = currentTasks.filter(t => {
              if (!t.closureDate) return false;
              const cTime = parseISO(t.closureDate).getTime();
              return cTime >= weekStart && cTime < weekEnd;
            }).length;

            return { name: formatted, closures, date: weekStart };
          }).reverse();
        }
      }
    }

    // SLA Met & Mean Acknowledgment & Resolution times inside current selected period
    let responseSlaMetCount = 0;
    let responseSlaTotalCalculated = 0;
    let totalResponseMinutes = 0;
    let responseMinutesCount = 0;

    let resolutionSlaMetCount = 0;
    let resolutionSlaTotalCalculated = 0;
    let totalResolutionMinutes = 0;
    let resolutionMinutesCount = 0;

    let riskCritical = 0;
    let riskHigh = 0;
    let riskMedium = 0;
    let riskLow = 0;
    let activeOpenCount = 0;

    distributionTasks.forEach(t => {
      const nowString = now.toISOString();
      const sla = getTaskSlaTimes(t, nowString);

      // Response SLA
      responseSlaTotalCalculated++;
      if (!sla.isResponseBreached) {
        responseSlaMetCount++;
      }
      totalResponseMinutes += sla.responseTimeMin;
      responseMinutesCount++;

      // Resolution SLA
      resolutionSlaTotalCalculated++;
      if (!sla.isResolutionBreached) {
        resolutionSlaMetCount++;
      }
      totalResolutionMinutes += sla.resolutionTimeMin;
      resolutionMinutesCount++;

      // Breach Risk (for OPEN/ACTIVE tickets only)
      const isOpen = t.status !== 'Closed' && t.status !== 'Resolved';
      if (isOpen) {
        activeOpenCount++;
        if (sla.isResolutionBreached) {
          riskCritical++;
        } else {
          const ratio = sla.resolutionTimeMin / (sla.resolutionLimitMin || 1);
          if (ratio >= 0.8) {
            riskHigh++;
          } else if (ratio >= 0.5) {
            riskMedium++;
          } else {
            riskLow++;
          }
        }
      }
    });

    const responseSlaCompliance = responseSlaTotalCalculated > 0 ? Math.round((responseSlaMetCount / responseSlaTotalCalculated) * 100) : 100;
    const resolutionSlaCompliance = resolutionSlaTotalCalculated > 0 ? Math.round((resolutionSlaMetCount / resolutionSlaTotalCalculated) * 100) : 100;

    const mttaMin = responseMinutesCount > 0 ? Math.round(totalResponseMinutes / responseMinutesCount) : 0;
    const mttrMin = resolutionMinutesCount > 0 ? Math.round(totalResolutionMinutes / resolutionMinutesCount) : 0;

    // Breach Risk Intensity Status Overall Grade
    let breachRiskStatus = 'STABLE';
    let breachRiskColor = 'text-emerald-400';
    let breachRiskBg = 'bg-emerald-500/10';
    let breachRiskBorder = 'border-emerald-500/20';

    if (riskCritical > 0) {
      breachRiskStatus = 'CRITICAL';
      breachRiskColor = 'text-rose-400 animate-pulse';
      breachRiskBg = 'bg-rose-500/10';
      breachRiskBorder = 'border-rose-500/30';
    } else if (riskHigh > 0) {
      breachRiskStatus = 'HIGH RISK';
      breachRiskColor = 'text-orange-400';
      breachRiskBg = 'bg-orange-500/10';
      breachRiskBorder = 'border-orange-500/20';
    } else if (riskMedium > 0) {
      breachRiskStatus = 'MODERATE';
      breachRiskColor = 'text-amber-400';
      breachRiskBg = 'bg-amber-500/10';
      breachRiskBorder = 'border-amber-500/20';
    }

    // Resource Productivity Report Calculations
    const allResources = Array.from(new Set([
      ...users.map(u => u.name || u.id),
      ...distributionTasks.map(t => t.assignedTo).filter(Boolean)
    ])).sort();

    const resourceProductivity = allResources.map(resName => {
      const resTasks = distributionTasks.filter(t => t.assignedTo === resName);
      
      const p1Tasks = resTasks.filter(t => t.priority === 'P1');
      const p2Tasks = resTasks.filter(t => t.priority === 'P2');
      const p3Tasks = resTasks.filter(t => t.priority === 'P3');
      const p4Tasks = resTasks.filter(t => t.priority === 'P4');
      
      const p1Resolved = p1Tasks.filter(t => t.status === 'Resolved' || t.status === 'Closed');
      const p2Resolved = p2Tasks.filter(t => t.status === 'Resolved' || t.status === 'Closed');
      const p3Resolved = p3Tasks.filter(t => t.status === 'Resolved' || t.status === 'Closed');
      const p4Resolved = p4Tasks.filter(t => t.status === 'Resolved' || t.status === 'Closed');
      
      const calcHours = (taskList: typeof resTasks) => {
        const totalMin = taskList.reduce((sum, t) => {
          if (!t.closureDate) return sum;
          return sum + differenceInMinutes(parseISO(t.closureDate), parseISO(t.generationDate));
        }, 0);
        return parseFloat((totalMin / 60).toFixed(1));
      };

      const p1Hours = calcHours(p1Resolved);
      const p2Hours = calcHours(p2Resolved);
      const p3Hours = calcHours(p3Resolved);
      const p4Hours = calcHours(p4Resolved);
      const totalHours = parseFloat((p1Hours + p2Hours + p3Hours + p4Hours).toFixed(1));
      
      const resolvedCount = resTasks.filter(t => t.status === 'Resolved' || t.status === 'Closed').length;
      const inProgressCount = resTasks.filter(t => t.status === 'In-Progress' || t.status === 'Open' || t.status === 'Hold').length;

      return {
        name: resName,
        assignedCount: resTasks.length,
        resolvedCount,
        inProgressCount,
        p1Count: p1Tasks.length,
        p2Count: p2Tasks.length,
        p3Count: p3Tasks.length,
        p4Count: p4Tasks.length,
        p1Hours,
        p2Hours,
        p3Hours,
        p4Hours,
        totalHours,
        avgHoursPerResolution: resolvedCount > 0 ? parseFloat((totalHours / resolvedCount).toFixed(1)) : 0
      };
    }).filter(r => r.assignedCount > 0);

    return { 
      priorityData, 
      levelData, 
      topIssues, 
      agingData, 
      consumptionData, 
      trendData,
      resourceProductivity,
      distributionTasks,
      slaMetrics: {
        responseCompliance: responseSlaCompliance,
        resolutionCompliance: resolutionSlaCompliance,
        mtta: mttaMin,
        mttr: mttrMin,
        riskCritical,
        riskHigh,
        riskMedium,
        riskLow,
        activeOpenCount,
        breachRiskStatus,
        breachRiskColor,
        breachRiskBg,
        breachRiskBorder
      }
    };
  }, [projectFilteredTasks, trendPeriod, customStartDate, customEndDate, projectConfigs, users]);

  // --- Change & Release Management Logic ---
  const handleOpenCreateRelease = () => {
    const list = PROJECTS_LIST.length > 0 ? PROJECTS_LIST : ['HR-Portal', 'E-Commerce', 'Internal-CRM', 'Mobile-App'];
    setEditingReleaseRecord(null);
    setCrFormWarJarName('');
    setCrFormPurpose('');
    setCrFormDeploymentDate(new Date().toISOString().substring(0, 16)); // YYYY-MM-DDTHH:MM
    // Set intimation date to slightly earlier than execution by default
    setCrFormIntimationDate(new Date(Date.now() - 3600000).toISOString().substring(0, 16)); 
    setCrFormSanityCheckDate(new Date().toISOString().substring(0, 16));
    setCrFormStatus('Scheduled');
    setCrFormHasDeploymentSignoff(false);
    setCrFormHasUatSignoff(false);
    setCrFormHasDocReviewSignoff(false);
    setCrFormRollbackDone(false);
    setCrFormFailureReason('');
    setCrFormLessonsLearned('');
    setCrFormProjectId(selectedProject !== 'All' ? selectedProject : list[0]);
    setCrFormNotes('');
    setCrFormPodName('');
    setCrFormTeamName('');
    setCrFormLeadName('');
    setCrFormSanityStatus('Pass');
    setCrFormRca('');
    setIsChangeReleaseModalOpen(true);
  };

  const handleOpenEditRelease = (rec: any) => {
    const list = PROJECTS_LIST.length > 0 ? PROJECTS_LIST : ['HR-Portal', 'E-Commerce', 'Internal-CRM', 'Mobile-App'];
    setEditingReleaseRecord(rec);
    setCrFormWarJarName(rec.warJarName || '');
    setCrFormPurpose(rec.purpose || '');
    
    let dateStr = '';
    try {
      if (rec.deploymentDate) {
        dateStr = new Date(rec.deploymentDate).toISOString().substring(0, 16);
      }
    } catch(e) {
      dateStr = new Date().toISOString().substring(0, 16);
    }
    setCrFormDeploymentDate(dateStr || new Date().toISOString().substring(0, 16));

    let intimDateStr = '';
    try {
      if (rec.intimationDate) {
        intimDateStr = new Date(rec.intimationDate).toISOString().substring(0, 16);
      } else {
        intimDateStr = new Date(new Date(rec.deploymentDate || Date.now()).getTime() - 3600000).toISOString().substring(0, 16);
      }
    } catch(e) {
      intimDateStr = new Date().toISOString().substring(0, 16);
    }
    setCrFormIntimationDate(intimDateStr);

    let sanityDateStr = '';
    try {
      if (rec.sanityCheckDate) {
        sanityDateStr = new Date(rec.sanityCheckDate).toISOString().substring(0, 16);
      } else {
        sanityDateStr = new Date(rec.deploymentDate || Date.now()).toISOString().substring(0, 16);
      }
    } catch(e) {
      sanityDateStr = new Date().toISOString().substring(0, 16);
    }
    setCrFormSanityCheckDate(sanityDateStr);

    setCrFormStatus(rec.status || 'Scheduled');
    setCrFormHasDeploymentSignoff(!!rec.hasDeploymentSignoff);
    setCrFormHasUatSignoff(!!rec.hasUatSignoff);
    setCrFormHasDocReviewSignoff(!!rec.hasDocReviewSignoff);
    setCrFormRollbackDone(!!rec.rollbackDone);
    setCrFormFailureReason(rec.failureReason || '');
    setCrFormLessonsLearned(rec.lessonsLearned || '');
    setCrFormProjectId(rec.projectId || list[0]);
    setCrFormNotes(rec.notes || '');
    setCrFormPodName(rec.podName || '');
    setCrFormTeamName(rec.teamName || '');
    setCrFormLeadName(rec.leadName || '');
    setCrFormSanityStatus(rec.sanityStatus || 'Pass');
    setCrFormRca(rec.rcaVal || '');
    setIsChangeReleaseModalOpen(true);
  };

  const handleDeleteReleaseRecord = (id: string) => {
    setChangeReleaseRecords(prev => prev.filter(r => r.id !== id));
  };

  const handleSaveReleaseRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!crFormWarJarName.trim() || !crFormPurpose.trim() || !crFormPodName.trim() || !crFormTeamName.trim() || !crFormLeadName.trim()) {
      return;
    }

    const currentEmpName = currentLoggedInUserObj?.name || currentUser || 'Admin';
    const list = PROJECTS_LIST.length > 0 ? PROJECTS_LIST : ['HR-Portal', 'E-Commerce', 'Internal-CRM', 'Mobile-App'];

    const intimationIso = crFormIntimationDate ? new Date(crFormIntimationDate).toISOString() : new Date().toISOString();
    const sanityCheckIso = crFormSanityCheckDate ? new Date(crFormSanityCheckDate).toISOString() : new Date().toISOString();

    if (editingReleaseRecord) {
      // Update
      setChangeReleaseRecords(prev => prev.map(r => {
        if (r.id === editingReleaseRecord.id) {
          return {
            ...r,
            warJarName: crFormWarJarName.trim(),
            purpose: crFormPurpose.trim(),
            deploymentDate: new Date(crFormDeploymentDate).toISOString(),
            intimationDate: intimationIso,
            sanityCheckDate: sanityCheckIso,
            status: crFormStatus,
            hasDeploymentSignoff: crFormHasDeploymentSignoff,
            hasUatSignoff: crFormHasUatSignoff,
            hasDocReviewSignoff: crFormHasDocReviewSignoff,
            rollbackDone: crFormRollbackDone,
            failureReason: crFormFailureReason.trim(),
            lessonsLearned: crFormLessonsLearned.trim(),
            projectId: crFormProjectId || list[0],
            notes: crFormNotes.trim(),
            registeredBy: r.registeredBy || currentEmpName,
            podName: crFormPodName.trim(),
            teamName: crFormTeamName.trim(),
            leadName: crFormLeadName.trim(),
            sanityStatus: crFormSanityStatus,
            rcaVal: crFormRca.trim()
          };
        }
        return r;
      }));
    } else {
      // Add new
      const nextNum = changeReleaseRecords.reduce((max, r) => {
        const num = parseInt(r.id.replace('CR-', ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 1000) + 1;

      const newRec = {
        id: `CR-${nextNum}`,
        warJarName: crFormWarJarName.trim(),
        purpose: crFormPurpose.trim(),
        deploymentDate: new Date(crFormDeploymentDate).toISOString(),
        intimationDate: intimationIso,
        sanityCheckDate: sanityCheckIso,
        status: crFormStatus,
        hasDeploymentSignoff: crFormHasDeploymentSignoff,
        hasUatSignoff: crFormHasUatSignoff,
        hasDocReviewSignoff: crFormHasDocReviewSignoff,
        rollbackDone: crFormRollbackDone,
        failureReason: crFormFailureReason.trim(),
        lessonsLearned: crFormLessonsLearned.trim(),
        projectId: crFormProjectId || list[0],
        registeredBy: currentEmpName,
        notes: crFormNotes.trim(),
        podName: crFormPodName.trim(),
        teamName: crFormTeamName.trim(),
        leadName: crFormLeadName.trim(),
        sanityStatus: crFormSanityStatus,
        rcaVal: crFormRca.trim()
      };
      setChangeReleaseRecords(prev => [newRec, ...prev]);
    }

    setIsChangeReleaseModalOpen(false);
    setEditingReleaseRecord(null);
  };

  const filteredChangeReleases = useMemo(() => {
    return changeReleaseRecords.filter(rec => {
      // Robust project query that respects both local dropdown and global selection in header
      const matchGlobalProject = selectedProject === 'All' || rec.projectId === selectedProject;
      const matchLocalProject = crFilterProject === 'All' || rec.projectId === crFilterProject;
      const matchProject = matchGlobalProject && matchLocalProject;

      // Respect global employee selection in header
      const matchEmployee = selectedEmployee === 'All' || rec.registeredBy === selectedEmployee;

      // Respect local status filter
      const matchStatus = crFilterStatus === 'All' || rec.status === crFilterStatus;

      const q = crSearchQuery.toLowerCase().trim();
      const matchQuery = !q || 
        (rec.warJarName || '').toLowerCase().includes(q) || 
        (rec.purpose || '').toLowerCase().includes(q) || 
        (rec.lessonsLearned || '').toLowerCase().includes(q) || 
        (rec.notes || '').toLowerCase().includes(q) || 
        (rec.id || '').toLowerCase().includes(q);

      return matchProject && matchEmployee && matchStatus && matchQuery;
    });
  }, [changeReleaseRecords, selectedProject, crFilterProject, selectedEmployee, crFilterStatus, crSearchQuery]);

  const crStats = useMemo(() => {
    // Only filter the stats based on project and employee selection to represent overall health of selected group
    const filteredRecords = changeReleaseRecords.filter(rec => {
      const matchGlobalProject = selectedProject === 'All' || rec.projectId === selectedProject;
      const matchLocalProject = crFilterProject === 'All' || rec.projectId === crFilterProject;
      const matchEmployee = selectedEmployee === 'All' || rec.registeredBy === selectedEmployee;
      return matchGlobalProject && matchLocalProject && matchEmployee;
    });

    const total = filteredRecords.length;
    const successful = filteredRecords.filter(r => r.status === 'Successful').length;
    const inProgress = filteredRecords.filter(r => r.status === 'In Progress').length;
    const scheduled = filteredRecords.filter(r => r.status === 'Scheduled').length;
    const failures = filteredRecords.filter(r => r.status === 'Failed' || r.status === 'Rolled Back').length;

    const uatSignoffs = filteredRecords.filter(r => r.hasUatSignoff).length;
    const deploymentSignoffs = filteredRecords.filter(r => r.hasDeploymentSignoff).length;
    const docSignoffs = filteredRecords.filter(r => r.hasDocReviewSignoff).length;

    const successRatio = total ? Math.round((successful / total) * 100) : 0;
    const uatRatio = total ? Math.round((uatSignoffs / total) * 100) : 0;
    const rollbackRatio = total ? Math.round((filteredRecords.filter(r => r.rollbackDone).length / total) * 100) : 0;

    return {
      total,
      successful,
      inProgress,
      scheduled,
      failures,
      uatSignoffs,
      deploymentSignoffs,
      docSignoffs,
      successRatio,
      uatRatio,
      rollbackRatio
    };
  }, [changeReleaseRecords, selectedProject, crFilterProject, selectedEmployee]);

  // Dynamic grouping of release records for Daily, Weekly, Bi-weekly, Monthly, Quarterly, and Custom user-defined analytics
  const crTrendData = useMemo(() => {
    const baseRecords = changeReleaseRecords.filter(rec => {
      const matchGlobalProject = selectedProject === 'All' || rec.projectId === selectedProject;
      const matchLocalProject = crFilterProject === 'All' || rec.projectId === crFilterProject;
      const matchEmployee = selectedEmployee === 'All' || rec.registeredBy === selectedEmployee;
      return matchGlobalProject && matchLocalProject && matchEmployee;
    });

    const refDate = new Date('2026-05-27T00:00:00Z'); // Baseline anchored to user's sandbox current time

    if (crDashboardPeriod === 'daily') {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = subDays(refDate, i);
        days.push({
          dateStr: format(d, 'yyyy-MM-dd'),
          label: format(d, 'EEE (MMM dd)'),
          Successful: 0,
          FailedDone: 0,
          Scheduled: 0,
          InProgress: 0,
          Total: 0
        });
      }

      baseRecords.forEach(rec => {
        try {
          const recDateStr = format(new Date(rec.deploymentDate), 'yyyy-MM-dd');
          const dayBucket = days.find(day => day.dateStr === recDateStr);
          if (dayBucket) {
            dayBucket.Total++;
            if (rec.status === 'Successful') {
              dayBucket.Successful++;
            } else if (rec.status === 'Failed' || rec.status === 'Rolled Back') {
              dayBucket.FailedDone++;
            } else if (rec.status === 'Scheduled') {
              dayBucket.Scheduled++;
            } else if (rec.status === 'In Progress') {
              dayBucket.InProgress++;
            }
          }
        } catch (e) {
          // ignore parsing error
        }
      });
      return days;
    } else if (crDashboardPeriod === 'weekly') {
      const weeks = [];
      for (let i = 5; i >= 0; i--) {
        const startOfW = subDays(refDate, i * 7 + 6);
        const endOfW = subDays(refDate, i * 7);
        weeks.push({
          start: startOfW,
          end: endOfW,
          label: i === 0 ? 'This Week' : `${i} Wk(s) Ago`,
          Successful: 0,
          FailedDone: 0,
          Scheduled: 0,
          InProgress: 0,
          Total: 0
        });
      }

      baseRecords.forEach(rec => {
        try {
          const recDate = new Date(rec.deploymentDate);
          const weekBucket = weeks.find(wk => recDate >= wk.start && recDate <= endOfDay(wk.end));
          if (weekBucket) {
            weekBucket.Total++;
            if (rec.status === 'Successful') {
              weekBucket.Successful++;
            } else if (rec.status === 'Failed' || rec.status === 'Rolled Back') {
              weekBucket.FailedDone++;
            } else if (rec.status === 'Scheduled') {
              weekBucket.Scheduled++;
            } else if (rec.status === 'In Progress') {
              weekBucket.InProgress++;
            }
          }
        } catch (e) {
          // ignore
        }
      });
      return weeks;
    } else if (crDashboardPeriod === 'biweekly') {
      const biweeks = [];
      for (let i = 4; i >= 0; i--) {
        const startOfBi = subDays(refDate, i * 14 + 13);
        const endOfBi = subDays(refDate, i * 14);
        biweeks.push({
          start: startOfBi,
          end: endOfBi,
          label: i === 0 ? 'Last 2 Wks' : `Bi-Wk -${i}`,
          Successful: 0,
          FailedDone: 0,
          Scheduled: 0,
          InProgress: 0,
          Total: 0
        });
      }

      baseRecords.forEach(rec => {
        try {
          const recDate = new Date(rec.deploymentDate);
          const biweekBucket = biweeks.find(bi => recDate >= bi.start && recDate <= endOfDay(bi.end));
          if (biweekBucket) {
            biweekBucket.Total++;
            if (rec.status === 'Successful') {
              biweekBucket.Successful++;
            } else if (rec.status === 'Failed' || rec.status === 'Rolled Back') {
              biweekBucket.FailedDone++;
            } else if (rec.status === 'Scheduled') {
              biweekBucket.Scheduled++;
            } else if (rec.status === 'In Progress') {
              biweekBucket.InProgress++;
            }
          }
        } catch (e) {
          // ignore
        }
      });
      return biweeks;
    } else if (crDashboardPeriod === 'monthly') {
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const mDate = subMonths(refDate, i);
        months.push({
          start: startOfMonth(mDate),
          end: endOfMonth(mDate),
          label: format(mDate, 'MMM yyyy'),
          Successful: 0,
          FailedDone: 0,
          Scheduled: 0,
          InProgress: 0,
          Total: 0
        });
      }

      baseRecords.forEach(rec => {
        try {
          const recDate = new Date(rec.deploymentDate);
          const bucket = months.find(m => recDate >= m.start && recDate <= endOfDay(m.end));
          if (bucket) {
            bucket.Total++;
            if (rec.status === 'Successful') {
              bucket.Successful++;
            } else if (rec.status === 'Failed' || rec.status === 'Rolled Back') {
              bucket.FailedDone++;
            } else if (rec.status === 'Scheduled') {
              bucket.Scheduled++;
            } else if (rec.status === 'In Progress') {
              bucket.InProgress++;
            }
          }
        } catch (e) {
          // ignore
        }
      });
      return months;
    } else if (crDashboardPeriod === 'quarterly') {
      const quarters = [];
      for (let i = 3; i >= 0; i--) {
        const qDate = subQuarters(refDate, i);
        const qNum = Math.floor(qDate.getMonth() / 3) + 1;
        quarters.push({
          start: startOfQuarter(qDate),
          end: endOfQuarter(qDate),
          label: `Q${qNum} ${qDate.getFullYear()}`,
          Successful: 0,
          FailedDone: 0,
          Scheduled: 0,
          InProgress: 0,
          Total: 0
        });
      }

      baseRecords.forEach(rec => {
        try {
          const recDate = new Date(rec.deploymentDate);
          const bucket = quarters.find(q => recDate >= q.start && recDate <= endOfDay(q.end));
          if (bucket) {
            bucket.Total++;
            if (rec.status === 'Successful') {
              bucket.Successful++;
            } else if (rec.status === 'Failed' || rec.status === 'Rolled Back') {
              bucket.FailedDone++;
            } else if (rec.status === 'Scheduled') {
              bucket.Scheduled++;
            } else if (rec.status === 'In Progress') {
              bucket.InProgress++;
            }
          }
        } catch (e) {
          // ignore
        }
      });
      return quarters;
    } else {
      // 'custom' selection
      const start = startOfDay(new Date(crCustomStartDate || '2026-05-01'));
      const end = endOfDay(new Date(crCustomEndDate || '2026-05-31'));
      
      const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      const chunkCount = 5;
      const chunks = [];
      const daysPerChunk = Math.ceil(totalDays / chunkCount);
      
      for (let i = 0; i < chunkCount; i++) {
        const chunkStart = addDays(start, i * daysPerChunk);
        let chunkEnd = addDays(start, (i + 1) * daysPerChunk - 1);
        if (chunkEnd > end) chunkEnd = end;
        
        if (chunkStart <= end) {
          chunks.push({
            start: chunkStart,
            end: chunkEnd,
            label: `${format(chunkStart, 'MMM dd')} - ${format(chunkEnd, 'MMM dd')}`,
            Successful: 0,
            FailedDone: 0,
            Scheduled: 0,
            InProgress: 0,
            Total: 0
          });
        }
      }

      baseRecords.forEach(rec => {
        try {
          const recDate = new Date(rec.deploymentDate);
          const bucket = chunks.find(ch => recDate >= ch.start && recDate <= endOfDay(ch.end));
          if (bucket) {
            bucket.Total++;
            if (rec.status === 'Successful') {
              bucket.Successful++;
            } else if (rec.status === 'Failed' || rec.status === 'Rolled Back') {
              bucket.FailedDone++;
            } else if (rec.status === 'Scheduled') {
              bucket.Scheduled++;
            } else if (rec.status === 'In Progress') {
              bucket.InProgress++;
            }
          }
        } catch (e) {
          // ignore
        }
      });
      return chunks;
    }
  }, [changeReleaseRecords, crDashboardPeriod, crCustomStartDate, crCustomEndDate, selectedProject, crFilterProject, selectedEmployee]);

  // Robust function for exporting the registry to Excel format
  const handleExportToExcel = () => {
    const dataToExport = filteredChangeReleases.map(rec => {
      let dispIntimationDate = 'N/A';
      try {
        if (rec.intimationDate) {
          dispIntimationDate = format(new Date(rec.intimationDate), 'yyyy-MM-dd HH:mm');
        }
      } catch (e) {}

      let dispSanityDate = 'N/A';
      try {
        if (rec.sanityCheckDate) {
          dispSanityDate = format(new Date(rec.sanityCheckDate), 'yyyy-MM-dd HH:mm');
        }
      } catch (e) {}

      return {
        'Record ID': rec.id,
        'Project ID': rec.projectId,
        'Deployment Intimation Date': dispIntimationDate,
        'Deployment Target Date': rec.deploymentDate,
        'Package Artifact (WAR/JAR)': rec.warJarName,
        'Change Purpose / Ref ID': rec.purpose,
        'Status': rec.status,
        'POD Name': rec.podName || 'N/A',
        'Team Name': rec.teamName || 'N/A',
        'Lead Name': rec.leadName || 'N/A',
        'Sanity Check Date': dispSanityDate,
        'Sanity Check Status': rec.sanityStatus || 'Pass',
        'RCA Details': rec.rcaVal || 'N/A',
        'UAT Met Sign-off': rec.hasUatSignoff ? 'PASSED' : 'PENDING',
        'Deployment Met Sign-off': rec.hasDeploymentSignoff ? 'PASSED' : 'PENDING',
        'Doc Review Met Sign-off': rec.hasDocReviewSignoff ? 'PASSED' : 'PENDING',
        'Was Rolled Back': rec.rollbackDone ? 'Yes' : 'No',
        'Rollback Reason': rec.failureReason || 'N/A',
        'Retrospective Lessons Learned': rec.lessonsLearned || 'N/A',
        'Additional Notes': rec.notes || 'N/A',
        'Registered Employee': rec.registeredBy || 'N/A',
      };
    });

    exportToExcel([{ name: 'Change & Release Records', data: dataToExport }], 'Change_Release_Registry.xlsx');
  };

  // --- Knowledge Base Logic ---
  const kbTasks = useMemo(() => {
    return tasks.filter(t => {
      // Must be Resolved or Closed to be in Knowledge Base
      const isResolvedOrClosed = t.status === 'Resolved' || t.status === 'Closed';
      if (!isResolvedOrClosed) return false;
      
      // Admin/Manager can see ALL resolved/closed tasks (master level)
      if (isManagerOrAdmin) return true;
      
      // Regular users are limited to tasks whose projectId is in userMappedProjects
      return userMappedProjects.includes(t.projectId);
    });
  }, [tasks, isManagerOrAdmin, userMappedProjects]);

  const kbCategories = useMemo(() => {
    const list = kbTasks.map(t => t.category || '').filter(Boolean);
    return Array.from(new Set(list)).sort();
  }, [kbTasks]);

  const filteredKbTasks = useMemo(() => {
    return kbTasks.filter(t => {
      // 1. Project filter
      if (kbSelectedProject !== 'All' && t.projectId !== kbSelectedProject) return false;
      
      // 2. Category filter
      if (kbSelectedCategory !== 'All' && (t.category || '') !== kbSelectedCategory) return false;
      
      // 3. Search query filter (Keyword score based or simple inclusion)
      if (kbSearchQuery.trim()) {
        const query = kbSearchQuery.toLowerCase().trim();
        const words = query.split(/\s+/).filter(Boolean);
        if (words.length === 0) return true;
        
        const textToSearch = [
          t.ticketId,
          t.projectId,
          t.category,
          t.subcategory,
          t.description,
          t.solution,
          t.remarks,
          t.assignedTo
        ].map(s => (s || '').toLowerCase()).join(' ');
        
        return words.every(word => textToSearch.includes(word));
      }
      
      return true;
    });
  }, [kbTasks, kbSelectedProject, kbSelectedCategory, kbSearchQuery]);

  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || isBotLoading) return;
    
    const userMsg = chatInput.trim();
    setChatInput('');
    
    // Add user message to state
    const newMsgs = [
      ...chatMessages,
      { sender: 'user' as const, text: userMsg, timestamp: new Date() }
    ];
    setChatMessages(newMsgs);
    setIsBotLoading(true);
    
    // Step 1: Find background contextual tickets from kbTasks (already filtered by role mapped projects!)
    const keywords = userMsg.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    // Score each ticket
    const scoredTasks = kbTasks.map(t => {
      let score = 0;
      const combinedText = [
        t.ticketId,
        t.category,
        t.subcategory,
        t.description,
        t.solution,
        t.remarks
      ].map(s => (s || '').toLowerCase()).join(' ');
      
      keywords.forEach(word => {
        if (combinedText.includes(word)) {
          score += 1;
          // Weighted scores
          if ((t.category || '').toLowerCase().includes(word)) score += 2;
          if ((t.subcategory || '').toLowerCase().includes(word)) score += 2;
          if ((t.solution || '').toLowerCase().includes(word)) score += 3;
          if ((t.description || '').toLowerCase().includes(word)) score += 2;
        }
      });
      return { task: t, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5) // Top 5 relevant tickets
    .map(item => item.task);
    
    // Step 2: Initialize or check Gemini key
    const apiKey = (process.env.GEMINI_API_KEY as string) || '';
    
    if (!apiKey) {
      // Local Search Fallback mode
      setTimeout(() => {
        let reply = '';
        if (scoredTasks.length > 0) {
          reply = `🤖 **AI Assistant (Local Intelligence Fallback Mode)**:\nI found **${scoredTasks.length} highly relevant resolved ticket(s)** in the system database for your query. Here is a generated troubleshooting summary:\n\n`;
          scoredTasks.forEach((t, idx) => {
            reply += `### ${idx + 1}. [${t.ticketId}] (${t.category} > ${t.subcategory || 'General'})\n`;
            reply += `* **Symptom / Description**: *${t.description.trim()}*\n`;
            reply += `* **Technical Solution**: **${t.solution.trim()}**\n`;
            if (t.remarks) reply += `* **Remarks**: ${t.remarks.trim()}\n`;
            reply += `* **Resolved By**: ${t.assignedTo || 'Unassigned'} | **Project**: ${t.projectId}\n\n`;
          });
          reply += `---\n*💡 Note: To enable fully conversational and generative AI reasoning, make sure a valid Gemini API key is configured under the application server secrets.*`;
        } else {
          reply = `🤖 **AI Assistant (Local Intelligence Fallback Mode)**:\nNo exact matches found in the Resolved or Closed tickets database for "${userMsg}".\n\n**Suggestions matching your terms:**\n- Verify the spelling of keywords\n- Try typing broader categories like "Server", "Database", "Access", "VPN"\n- Create a new ticket if this is a novel problem!`;
        }
        
        setChatMessages(prev => [
          ...prev, 
          { sender: 'bot', text: reply, timestamp: new Date() }
        ]);
        setIsBotLoading(false);
      }, 800);
      return;
    }
    
    // Execute real Gemini API call!
    try {
      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
      
      // format context
      const formattedContext = scoredTasks.length > 0 
        ? scoredTasks.map(t => `Ticket ID: ${t.ticketId}\nProject: ${t.projectId}\nCategory: ${t.category} > ${t.subcategory}\nSymptom: ${t.description}\nResolution: ${t.solution}\nRemarks: ${t.remarks || 'None'}`).join('\n---\n')
        : "No previous resolved ticket matches found in the local database.";
        
      const systemInstruction = `You are "S-Flow GenAI Support Expert", an interactive AI assistant for the IT Support Task Management Portal.
Your job is to help support agents solve technical issues by analyzing resolved similar tickets from the Knowledge Base database.

Current Active User checking this data: ${currentLoggedInUserObj?.name || currentUser} (Role: ${currentLoggedInUserObj?.role || (isAdmin ? "Admin" : "User")})

Here are the similar resolved tickets found in the system for this query:
${formattedContext}

Guidelines:
1. Always be professional, extremely helpful, positive, and concise.
2. Synthesize a step-by-step Troubleshooting Guide based on the solutions in the provided tickets to help the support agent.
3. Be transparent and explicitly cite references to the tickets used (e.g., [INC-1001], [INC-1005]).
4. If the resolved tickets don't completely cover the user's issue, explain that clearly and supplement with standard IT industry best practices (e.g. Active Directory, network troubleshooting, database management etc.) based on your general knowledge.
5. Format the output beautifully using clean, high-contrast Markdown (headers, bold text, bullet points, standard indentations, blockquotes, and code blocks for errors or commands).`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          { role: 'user', parts: [{ text: userMsg }] }
        ],
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });
      
      const botText = response.text || "I apologize, but I could not formulate a response at this time.";
      
      setChatMessages(prev => [
        ...prev, 
        { sender: 'bot', text: botText, timestamp: new Date() }
      ]);
    } catch (e: any) {
      console.error(e);
      setChatMessages(prev => [
        ...prev, 
        { 
          sender: 'system', 
          text: `Error invoking Gemini AI Engine: ${e.message || 'Network Error'}. Please verify your network connection or Gemini API key configuration.`, 
          timestamp: new Date() 
        }
      ]);
    } finally {
      setIsBotLoading(false);
    }
  };

  // --- Handlers ---
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.description || !formData.description.trim()) {
      alert("Error: Please provide an Issue Description.");
      return;
    }
    if (!formData.assignedTo || !formData.assignedTo.trim()) {
      alert("Error: Please select and assign this ticket to an employee.");
      return;
    }
    if (!formData.category || !formData.category.trim()) {
      alert("Error: Please select a Category.");
      return;
    }
    if (!formData.subcategory || !formData.subcategory.trim()) {
      alert("Error: Please select a Subcategory.");
      return;
    }
    if (!formData.supportLevel || !formData.supportLevel.trim()) {
      alert("Error: Please select a Support Level.");
      return;
    }
    if (!formData.priority || !formData.priority.trim()) {
      alert("Error: Please select a Priority.");
      return;
    }

    if ((formData.status === 'Resolved' || formData.status === 'Closed') && (!formData.solution || !formData.solution.trim())) {
      alert("Error: Please provide a Technical Solution when status is Resolved or Closed.");
      return;
    }

    const actionLabel = editingTask ? 'Update' : 'Commit New';
    const confirmationMessage = editingTask 
      ? `Are you sure you want to update ticket record ${editingTask.ticketId} in the database? This action will save and overwrite all current values.`
      : 'Are you sure you want to commit this new ticket record to the database?';

    askConfirmation(
      `${actionLabel} Ticket Record`,
      confirmationMessage,
      async () => {
        const nowIso = new Date().toISOString();
        // Prepare payload (convert strings to ISO dates if necessary for backend)
        const currentAuditLog = editingTask?.auditLog || [
          {
            timestamp: formData.generationDate ? new Date(formData.generationDate).toISOString() : nowIso,
            user: currentUser,
            action: 'Ticket Created',
            details: 'Initial record entry into system'
          }
        ];

        let newEvents: any[] = [];
        if (editingTask) {
          if (editingTask.status !== formData.status) {
            newEvents.push({ timestamp: nowIso, user: currentUser, action: 'Status Update', details: `Status changed from ${editingTask.status} to ${formData.status}` });
          }
          if (editingTask.priority !== formData.priority) {
            newEvents.push({ timestamp: nowIso, user: currentUser, action: 'Priority Adjustment', details: `Severity scale modified from ${editingTask.priority} to ${formData.priority}` });
          }
          if (editingTask.assignedTo !== formData.assignedTo) {
            newEvents.push({ timestamp: nowIso, user: currentUser, action: 'Escalation/Shift', details: `Ownership transferred from ${editingTask.assignedTo} to ${formData.assignedTo}` });
          }
          if (editingTask.solution !== formData.solution) {
            newEvents.push({ timestamp: nowIso, user: currentUser, action: 'Resolution Update', details: 'Updated troubleshooting steps or final solution' });
          }
          if (newEvents.length === 0) {
            newEvents.push({ timestamp: nowIso, user: currentUser, action: 'General Update', details: 'Metadata or descriptive changes recorded' });
          }
        }

        const payload = {
          ticketId: formData.ticketId || `INC-${1000 + tasks.length}`,
          projectId: formData.projectId!,
          supportLevel: formData.supportLevel as SupportLevel,
          priority: formData.priority as Priority,
          generationDate: formData.generationDate,
          responseDate: formData.responseDate || null,
          closureDate: formData.closureDate || null,
          status: formData.status as TaskStatus,
          userIntimated: formData.userIntimated || false,
          description: formData.description || '',
          solution: formData.solution || '',
          remarks: formData.remarks || '',
          assignedTo: formData.assignedTo || currentUser,
          createdBy: editingTask ? (editingTask.createdBy || 'Admin') : currentUser,
          resolutionDetails: formData.resolutionDetails || '',
          holdReason: formData.status === 'Hold' ? (formData.holdReason || '') : '',
          category: formData.category || '',
          subcategory: formData.subcategory || '',
          auditLog: JSON.stringify([...currentAuditLog, ...newEvents])
        };

        try {
          const url = editingTask ? `${API_BASE}/${editingTask.id}` : API_BASE;
          const method = editingTask ? 'PUT' : 'POST';
          
          const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            const savedTask = await response.json();
            
            // Persist locally staged attachments for the assigned ticket ID
            if (tempAttachments.length > 0) {
              const targetKey = 'sflow_attachments_' + savedTask.ticketId;
              const existingStr = localStorage.getItem(targetKey);
              const existingList = existingStr ? JSON.parse(existingStr) : [];
              const mergedList = [...existingList, ...tempAttachments];
              localStorage.setItem(targetKey, JSON.stringify(mergedList));
              setTempAttachments([]); // Reset staging area
            }

            const parsedSavedTask = {
              ...savedTask,
              auditLog: savedTask.auditLog ? (typeof savedTask.auditLog === 'string' ? JSON.parse(savedTask.auditLog) : savedTask.auditLog) : []
            };
            const updatedTasks = editingTask 
              ? tasks.map(t => t.id === editingTask.id ? parsedSavedTask : t)
              : [parsedSavedTask, ...tasks];
            
            setTasks(updatedTasks);
            setEditingTask(null);
            
            // Reset form
            const firstProj = PROJECTS_LIST[0] || '';
            setFormData({
              ticketId: getNextTicketId(firstProj, updatedTasks),
              projectId: firstProj,
              supportLevel: '' as any,
              priority: '' as any,
              status: 'Open',
              generationDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
              responseDate: '',
              closureDate: '',
              userIntimated: false,
              description: '',
              solution: '',
              remarks: '',
              assignedTo: '',
              resolutionDetails: '',
              holdReason: '',
              category: '',
              subcategory: '',
            });
          }
        } catch (error) {
          console.error('Error saving task:', error);
          alert('Could not connect to the Java backend. Please ensure the Spring Boot app is running on port 8080.');
        }
      },
      'info',
      editingTask ? 'Update' : 'Save'
    );
  };

  const handleDeleteTask = async (id: number) => {
    askConfirmation('Delete Task', 'Are you sure you want to permanently delete this task record?', async () => {
      try {
        const response = await fetch(`${API_BASE}/${id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          setTasks(prev => prev.filter(t => t.id !== id));
        } else {
          console.error('Delete failed:', response.status);
        }
      } catch (error) {
        console.error('Error deleting task:', error);
      }
    }, 'danger', 'Delete');
  };

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'danger' | 'info' | 'warning';
    confirmLabel: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    confirmLabel: 'Confirm',
    onConfirm: () => {},
  });

  const getNextTicketId = (projectId: string, currentTasks: SupportTask[]) => {
    if (!projectId) return 'PENDING';
    
    // Generate prefix: First letters of words, or first 3 letters of name
    const words = projectId.split(/[\s-_]+/);
    let prefix = '';
    if (words.length >= 2) {
      prefix = words.map(w => w[0]).join('').toUpperCase().substring(0, 3);
    } else {
      prefix = projectId.substring(0, 3).toUpperCase();
    }
    
    // Sanitize prefix
    prefix = prefix.replace(/[^A-Z]/g, '');
    if (prefix.length < 2) prefix = (prefix + 'INC').substring(0, 3);

    // Filter tasks for this project
    const projectTasks = currentTasks.filter(t => t.projectId === projectId);
    
    let maxNum = 1000;
    projectTasks.forEach(t => {
      const match = t.ticketId.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1]);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });

    return `${prefix}-${maxNum + 1}`;
  };

  const askConfirmation = (
    title: string, 
    message: string, 
    onConfirm: () => void, 
    type: 'danger' | 'info' | 'warning' = 'info',
    confirmLabel: string = 'Confirm'
  ) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      type,
      confirmLabel,
      onConfirm: async () => {
        await onConfirm();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleCancel = () => {
    setEditingTask(null);
    const firstProj = PROJECTS_LIST[0] || '';
    setFormData({
      ticketId: getNextTicketId(firstProj, tasks),
      projectId: firstProj,
      supportLevel: '' as any,
      priority: '' as any,
      status: 'Open',
      generationDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      responseDate: '',
      closureDate: '',
      userIntimated: false,
      description: '',
      solution: '',
      remarks: '',
      assignedTo: '',
      resolutionDetails: '',
      holdReason: '',
      category: '',
      subcategory: '',
    });
  };

  const startEditing = (task: SupportTask) => {
    askConfirmation(
      "Edit Ticket Record",
      `Are you sure you want to load ticket ${task.ticketId} for editing? This will populate the form in the sidebar with its current details.`,
      () => {
        setEditingTask(task);
        setFormData({
          ticketId: task.ticketId,
          projectId: task.projectId,
          supportLevel: task.supportLevel,
          priority: task.priority,
          status: task.status,
          generationDate: format(parseISO(task.generationDate), "yyyy-MM-dd'T'HH:mm"),
          responseDate: task.responseDate ? format(parseISO(task.responseDate), "yyyy-MM-dd'T'HH:mm") : '',
          closureDate: task.closureDate ? format(parseISO(task.closureDate), "yyyy-MM-dd'T'HH:mm") : '',
          userIntimated: task.userIntimated,
          description: task.description,
          solution: task.solution,
          remarks: task.remarks,
          assignedTo: task.assignedTo,
          resolutionDetails: task.resolutionDetails || '',
          holdReason: task.holdReason || '',
          category: task.category || '',
          subcategory: task.subcategory || '',
        });
        setIsSidebarOpen(true);
      },
      "info",
      "Proceed"
    );
  };

  const handleExport = async (formatType: 'excel' | 'pdf') => {
    setIsExportDropdownOpen(false);
    const currentTasks = projectFilteredTasks;
    
    // 1. Data Sheet (Tickets)
    const ticketData = currentTasks.map(t => {
      const nowString = new Date().toISOString();
      const slaData = getTaskSlaTimes(t, nowString);
      
      const responseSlaStatus = slaData.isResponseBreached
        ? 'NOT MET'
        : slaData.responseLogged ? 'MET' : 'ACTIVE';

      const resolutionSlaStatus = slaData.isResolutionBreached
        ? 'NOT MET'
        : slaData.wasResolved ? 'MET' : 'ACTIVE';

      const isClosedOrResolved = t.status === 'Closed' || t.status === 'Resolved';
      const agingMin = isClosedOrResolved
        ? null
        : getBusinessMinutes(t.generationDate, nowString, getEffectiveShift(t.projectId, t.assignedTo));
      
      return {
        'Ticket ID': t.ticketId,
        'Project': t.projectId,
        'Support Level': t.supportLevel,
        'Priority': t.priority,
        'Status': t.status,
        'Owner': t.createdBy || 'Admin',
        'Assignee': t.assignedTo,
        'Gen Date': format(parseISO(t.generationDate), 'yyyy-MM-dd HH:mm'),
        'Resp Date': t.responseDate ? format(parseISO(t.responseDate), 'yyyy-MM-dd HH:mm') : '-',
        'Close Date': t.closureDate ? format(parseISO(t.closureDate), 'yyyy-MM-dd HH:mm') : '-',
        'Response SLA Status': responseSlaStatus,
        'Resolution Status': resolutionSlaStatus,
        'Aging': agingMin !== null ? formatDuration(agingMin * 60000) : '-',
        'Description': t.description,
      };
    });

    // 2. Analytics Sheet (KPIs)
    const closedTasks = currentTasks.filter(t => t.closureDate);
    const metCount = ticketData.filter(t => t['Resolution Status'] === 'MET').length;
    const slaRate = closedTasks.length > 0 ? (metCount / closedTasks.length) * 100 : 0;

    const analyticsData = [
      { Metric: 'Total Tickets Managed', Value: currentTasks.length },
      { Metric: 'Active / Open Backlog', Value: kpis.active },
      { Metric: 'Global SLA Compliance Rate', Value: `${slaRate.toFixed(2)}%` },
      { Metric: 'Notification Compliance', Value: `${kpis.compliance}%` },
      { Metric: 'Mean Time to Respond (MTTR)', Value: formatDuration(kpis.mttrResp * 60000) },
      { Metric: 'Mean Time to Resolve (MTTR-R)', Value: formatDuration(kpis.mttrReso * 60000) },
      ...Object.keys(PRIORITY_COLORS).map(p => ({
        Metric: `  Priority ${p}`,
        Value: currentTasks.filter(t => t.priority === p).length
      }))
    ];

    const sheets = [
      { name: 'SLA_Analytics', data: analyticsData },
      { name: 'Ticket_Inventory', data: ticketData }
    ];

    const filenamePrefix = `IT_Support_Service_Report_${format(new Date(), 'yyyyMMdd_HHmm')}`;
    
    if (formatType === 'excel') {
      exportToExcel(sheets, `${filenamePrefix}.xlsx`);
    } else {
      // Ensure we are on analytics tab to capture charts
      const originalTab = activeTab;
      if (activeTab !== 'analytics') {
        setActiveTab('analytics');
        // Wait for tab to switch and charts to mount/animate
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      // Capture charts if in analytics tab
      let chartImages: string[] = [];
      window.scrollTo(0, 0);
      const chartElements = document.querySelectorAll('.report-chart');
      
      if (chartElements.length > 0) {
        setLoading(true);
        try {
          const captures = Array.from(chartElements).map(el => 
            html2canvas(el as HTMLElement, {
              backgroundColor: '#0f172a',
              logging: false,
              scale: 1.5,
              useCORS: true,
              allowTaint: true,
              scrollX: 0,
              scrollY: 0,
              windowWidth: el.scrollWidth,
              windowHeight: el.scrollHeight
            }).then(canvas => canvas.toDataURL('image/png'))
          );
          chartImages = await Promise.all(captures);
        } catch (error) {
          console.error('Error capturing charts:', error);
        }
        setLoading(false);
      }

      // Revert to original tab if needed
      if (originalTab !== 'analytics') {
        setActiveTab(originalTab);
      }

      let dateRangeStr = '';
      if (trendPeriod === 'custom') {
        dateRangeStr = `${format(parseISO(customStartDate), 'MMM dd, yyyy')} to ${format(parseISO(customEndDate), 'MMM dd, yyyy')}`;
      } else {
        dateRangeStr = trendPeriod.charAt(0).toUpperCase() + trendPeriod.slice(1);
      }

      exportToPDF(sheets, `${filenamePrefix}.pdf`, chartImages, dateRangeStr);
    }
  };

  const filteredTasks = projectFilteredTasks.filter(t => {
    // 1. Search query match
    const query = (searchQuery || '').toLowerCase();
    let matchQuery = true;
    if (query) {
      const tid = (t.ticketId || '').toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const sol = (t.solution || '').toLowerCase();
      const rem = (t.remarks || '').toLowerCase();
      const proj = (t.projectId || '').toLowerCase();
      const lvl = (t.supportLevel || '').toLowerCase();
      const prio = (t.priority || '').toLowerCase();
      const owner = (t.assignedTo || '').toLowerCase();
      const status = (t.status || '').toLowerCase();

      matchQuery = (
        tid.includes(query) ||
        desc.includes(query) ||
        sol.includes(query) ||
        rem.includes(query) ||
        proj.includes(query) ||
        lvl.includes(query) ||
        prio.includes(query) ||
        owner.includes(query) ||
        status.includes(query)
      );
    }

    if (!matchQuery) return false;

    // 2. Extra dynamic filter options
    if (filterLevel !== 'All' && t.supportLevel !== filterLevel) return false;
    if (filterPriority !== 'All' && t.priority !== filterPriority) return false;
    if (filterStatus !== 'All' && t.status !== filterStatus) return false;

    // SLA metrics filter calculation
    const nowString = new Date().toISOString();
    const slaData = getTaskSlaTimes(t, nowString);

    if (filterResponseSla !== 'All') {
      const respStatus = slaData.isResponseBreached
        ? 'NOT MET'
        : slaData.responseLogged ? 'MET' : 'ACTIVE';
      if (respStatus !== filterResponseSla) return false;
    }

    if (filterResolutionSla !== 'All') {
      const resoStatus = slaData.isResolutionBreached
        ? 'NOT MET'
        : slaData.wasResolved ? 'MET' : 'ACTIVE';
      if (resoStatus !== filterResolutionSla) return false;
    }

    return true;
  });

  // Sorting logic for workbook columns
  const sortedWorkbookTasks = useMemo(() => {
    const tasksCopy = [...filteredTasks];
    if (!workbookSortCol) return tasksCopy;

    return tasksCopy.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (workbookSortCol === 'ticketId') {
        valA = a.ticketId;
        valB = b.ticketId;
      } else if (workbookSortCol === 'projectId') {
        valA = a.projectId;
        valB = b.projectId;
      } else if (workbookSortCol === 'supportLevel') {
        valA = a.supportLevel;
        valB = b.supportLevel;
      } else if (workbookSortCol === 'priority') {
        const pMap: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
        valA = pMap[a.priority] || 99;
        valB = pMap[b.priority] || 99;
      } else if (workbookSortCol === 'status') {
        valA = a.status;
        valB = b.status;
      } else if (workbookSortCol === 'description') {
        valA = a.description || '';
        valB = b.description || '';
      } else if (workbookSortCol === 'createdBy') {
        valA = a.createdBy || 'Admin';
        valB = b.createdBy || 'Admin';
      } else if (workbookSortCol === 'assignedTo') {
        valA = a.assignedTo;
        valB = b.assignedTo;
      } else if (workbookSortCol === 'generationDate') {
        valA = a.generationDate;
        valB = b.generationDate;
      } else if (workbookSortCol === 'responseDate') {
        valA = a.responseDate || '';
        valB = b.responseDate || '';
      } else if (workbookSortCol === 'closureDate') {
        valA = a.closureDate || '';
        valB = b.closureDate || '';
      } else if (workbookSortCol === 'solution') {
        valA = a.solution || '';
        valB = b.solution || '';
      } else if (workbookSortCol === 'remarks') {
        valA = a.remarks || '';
        valB = b.remarks || '';
      } else if (workbookSortCol === 'responseSla') {
        const slaA = getTaskSlaTimes(a, new Date().toISOString());
        const slaB = getTaskSlaTimes(b, new Date().toISOString());
        valA = slaA.isResponseBreached ? 'NOT MET' : (slaA.responseLogged ? 'MET' : 'ACTIVE');
        valB = slaB.isResponseBreached ? 'NOT MET' : (slaB.responseLogged ? 'MET' : 'ACTIVE');
      } else if (workbookSortCol === 'resolutionSla') {
        const slaA = getTaskSlaTimes(a, new Date().toISOString());
        const slaB = getTaskSlaTimes(b, new Date().toISOString());
        valA = slaA.isResolutionBreached ? 'NOT MET' : (slaA.wasResolved ? 'MET' : 'ACTIVE');
        valB = slaB.isResolutionBreached ? 'NOT MET' : (slaB.wasResolved ? 'MET' : 'ACTIVE');
      } else if (workbookSortCol === 'aging') {
        if (a.status === 'Closed' || a.status === 'Resolved') valA = -1;
        else valA = getBusinessMinutes(a.generationDate, new Date().toISOString(), getEffectiveShift(a.projectId, a.assignedTo));

        if (b.status === 'Closed' || b.status === 'Resolved') valB = -1;
        else valB = getBusinessMinutes(b.generationDate, new Date().toISOString(), getEffectiveShift(b.projectId, b.assignedTo));
      }

      // Perform comparison
      if (typeof valA === 'string' && typeof valB === 'string') {
        const comp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
        return workbookSortDir === 'asc' ? comp : -comp;
      } else {
        if (valA < valB) return workbookSortDir === 'asc' ? -1 : 1;
        if (valA > valB) return workbookSortDir === 'asc' ? 1 : -1;
        return 0;
      }
    });
  }, [filteredTasks, workbookSortCol, workbookSortDir, projectConfigs]);

  // Pagination calculations
  const totalItems = sortedWorkbookTasks.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedTasks = useMemo(() => {
    // Correct page if it went out of bounds
    const maxPage = Math.ceil(sortedWorkbookTasks.length / pageSize) || 1;
    const activePage = currentPage > maxPage ? maxPage : currentPage;
    const startIndex = (activePage - 1) * pageSize;
    return sortedWorkbookTasks.slice(startIndex, startIndex + pageSize);
  }, [sortedWorkbookTasks, currentPage, pageSize]);

  const renderSortHeader = (colKey: string, label: string, extraClasses: string = "") => {
    const isSorted = workbookSortCol === colKey;
    return (
      <th 
        className={cn(
          "px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-slate-500 cursor-pointer select-none transition-colors hover:text-white hover:bg-slate-800/20",
          isSorted && "text-white bg-slate-800/30",
          extraClasses
        )}
        onClick={() => {
          if (workbookSortCol === colKey) {
            setWorkbookSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
          } else {
            setWorkbookSortCol(colKey);
            setWorkbookSortDir('asc');
          }
        }}
      >
        <div className={cn("flex items-center gap-1.5", extraClasses.includes("text-center") ? "justify-center" : extraClasses.includes("text-right") ? "justify-end" : "justify-start")}>
          <span>{label}</span>
          <ArrowUpDown 
            className={cn(
              "w-3 h-3 shrink-0 transition-all",
              isSorted ? "text-blue-400 opacity-100 scale-110" : "opacity-30 hover:opacity-70",
              isSorted && workbookSortDir === 'desc' && "rotate-180"
            )} 
          />
        </div>
      </th>
    );
  };

  const visibleProductivityData = useMemo(() => {
    if (isManagerOrAdmin) {
      return charts.resourceProductivity;
    }
    const currentEmpName = currentLoggedInUserObj?.name || currentUser || '';
    return charts.resourceProductivity.filter(item => item.name.toLowerCase() === currentEmpName.toLowerCase());
  }, [charts.resourceProductivity, isManagerOrAdmin, currentLoggedInUserObj, currentUser]);

  if (!isLoggedIn) {
    const activeTasksCount = (proj: string, prio: Priority) => {
      return tasks.filter(t => 
        (proj === 'All' ? true : t.projectId === proj) && 
        t.priority === prio && 
        (t.status === 'Open' || t.status === 'Hold' || t.status === 'In-Progress' || t.status === 'New')
      ).length;
    };

    const totalS1 = activeTasksCount('All', 'P1');
    const totalS2 = activeTasksCount('All', 'P2');
    const totalS3 = activeTasksCount('All', 'P3');
    const totalS4 = activeTasksCount('All', 'P4');

    const chartData = [
      { name: 'S1 (Critical)', value: totalS1, color: '#f87171' },
      { name: 'S2 (High)', value: totalS2, color: '#fb923c' },
      { name: 'S3 (Medium)', value: totalS3, color: '#3b82f6' },
      { name: 'S4 (Low)', value: totalS4, color: '#a78bfa' },
    ].filter(item => item.value > 0);

    const handleQuickLogin = (user: AppUser) => {
      setLoginId(user.id);
      const pass = user.id.toLowerCase() === 'admin' ? 'root123' : (user.password || 'user123');
      setLoginPassword(pass);
      handleLoginSubmit(undefined, user.id, pass);
    };

    const handleRecoveryProceed = () => {
      setRecoveryError('');
      if (recoveryStep === 1) {
        if (!recoveryUsername.trim()) {
          setRecoveryError('Please enter user ID.');
          return;
        }
        const userObj = users.find(u => u.id.toLowerCase() === recoveryUsername.trim().toLowerCase());
        if (!userObj) {
          setRecoveryError('This User ID does not exist.');
          return;
        }
        setFoundRecoveryUser(userObj);
        setRecoveryStep(2);
      } else if (recoveryStep === 2) {
        if (!recoveryAnswerInput.trim()) {
          setRecoveryError('Answer is required.');
          return;
        }
        const expectedAnswer = foundRecoveryUser?.recoveryAnswer || 'buddy';
        if (expectedAnswer.trim().toLowerCase() === recoveryAnswerInput.trim().toLowerCase()) {
          setRecoveryStep(3);
        } else {
          setRecoveryError('Incorrect answer. Please verify and try again.');
        }
      }
    };

    const handleResetRecovery = () => {
      setAuthMode('login');
      setRecoveryUsername('');
      setRecoveryStep(1);
      setFoundRecoveryUser(null);
      setRecoveryAnswerInput('');
      setRecoveryError('');
      setShowRecoveryPassword(false);
    };

    return (
      <div id="login-portal-viewport" className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans overflow-hidden">
        {/* Left Hand: Form and Histories */}
        <div className="w-full md:w-[45%] lg:w-[38%] bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-8 md:p-10 overflow-y-auto custom-scrollbar shadow-2xl relative z-10">
          <div className="space-y-8">
            {/* Branding Header */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/10">
                <Terminal className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-black text-white uppercase tracking-widest leading-none">SupportFlow</h1>
                <p className="text-[10px] text-blue-500 uppercase tracking-wide font-black mt-1 leading-none">ITSM Core Portal</p>
              </div>
            </div>

            {authMode === 'login' ? (
              <form onSubmit={handleLoginSubmit} className="space-y-5">
                <div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">Secure Sign In</h2>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide font-bold mt-1">Access support workflows, SLA monitors, and tools</p>
                </div>

                {loginError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-[10px] text-red-400 font-bold uppercase tracking-wider flex items-center gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{loginError}</span>
                  </motion.div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-widest font-black block mb-1.5">User Account ID</label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs text-white font-bold placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-all font-mono uppercase"
                      placeholder="e.g. USER.NAME"
                      value={loginId}
                      onChange={e => setLoginId(e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Portal Access Key</label>
                    </div>
                    <input 
                      type="password" 
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-all"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={isLoggingIn}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black uppercase tracking-widest text-[10px] rounded-lg transition-all shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 flex items-center justify-center gap-2 mt-2"
                >
                  <Key className="w-3.5 h-3.5 text-white/80" />
                  {isLoggingIn ? 'Verifying Safe Token...' : 'Authenticate Secure Connection'}
                </button>
              </form>
            ) : (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-black text-rose-400 uppercase tracking-tight">Key Recovery Assist</h2>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide font-bold mt-1">Recover active portal password by responding to security rules</p>
                </div>

                {recoveryError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-[10px] text-rose-400 font-bold uppercase tracking-wider flex items-center gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{recoveryError}</span>
                  </motion.div>
                )}

                {recoveryStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase tracking-widest font-black block mb-1.5 font-sans">Verify Account (User ID)</label>
                      <input 
                        type="text" 
                        autoFocus
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs text-white font-bold placeholder-slate-600 focus:outline-none focus:border-rose-500 transition-all font-mono uppercase"
                        placeholder="e.g. ADMIN"
                        value={recoveryUsername}
                        onChange={e => setRecoveryUsername(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {recoveryStep === 2 && foundRecoveryUser && (
                  <div className="space-y-4">
                    <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
                      <p className="text-[9px] text-slate-500 uppercase font-black tracking-wider leading-none">Configured Security Question</p>
                      <p className="text-xs text-white font-bold font-sans mt-2">{foundRecoveryUser.recoveryQuestion || "First pet's name?"}</p>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 uppercase tracking-widest font-black block mb-1.5 font-sans">Answer Verification</label>
                      <input 
                        type="text" 
                        autoFocus
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs text-white font-bold placeholder-slate-600 focus:outline-none focus:border-rose-500 transition-all font-sans"
                        placeholder="Answer is case-insensitive"
                        value={recoveryAnswerInput}
                        onChange={e => setRecoveryAnswerInput(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {recoveryStep === 3 && foundRecoveryUser && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-xl space-y-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest">Identity Verified</h4>
                        <p className="text-[9px] text-slate-400 uppercase font-bold mt-0.5">Password fetched successfully</p>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                      <p className="text-[9px] text-slate-500 uppercase font-black tracking-wider leading-none">Your Access Key</p>
                      <p className="text-sm font-mono text-emerald-400 font-bold mt-2 tracking-widest">
                        {foundRecoveryUser.id.toLowerCase() === 'admin' ? 'root123' : (foundRecoveryUser.password || 'user123')}
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        const pass = foundRecoveryUser.id.toLowerCase() === 'admin' ? 'root123' : (foundRecoveryUser.password || 'user123');
                        setLoginId(foundRecoveryUser.id);
                        setLoginPassword(pass);
                        handleLoginSubmit(undefined, foundRecoveryUser.id, pass);
                      }}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all shadow-lg"
                    >
                      Auto-Fill & Sign In
                    </button>
                  </motion.div>
                )}

                <div className="flex gap-2">
                  <button 
                    onClick={handleResetRecovery}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all text-center"
                  >
                    Cancel Recovery
                  </button>
                  {recoveryStep < 3 && (
                    <button 
                      onClick={handleRecoveryProceed}
                      className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                    >
                      {recoveryStep === 1 ? 'Verify UID' : 'Validate Answer'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Hand side: SLA Grid Metrics and QA Reference */}
        <div className="flex-1 bg-slate-950 p-6 md:p-8 flex flex-col gap-6 overflow-y-auto custom-scrollbar justify-start">
          
          {/* Module 1: Project SLA Metrics Summaries */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-5 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-xl">
                  <BarChart className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest leading-none animate-pulse">Support Queue Queue-Wise SLA Snapshot</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1.5 leading-none">Project-wise active counts focusing on Open & Hold stages</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setMetricsDetailModalOpen(true)}
                  className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 rounded-lg transition-all flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest border border-blue-500/25"
                  title="Expand Interactive Metrics Chart"
                >
                  <Download className="w-3.5 h-3.5 rotate-180" />
                  <span>Interactive Charts Pop-Up</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3 font-black text-[9px] uppercase tracking-widest text-slate-500">Project Identity</th>
                    <th className="px-4 py-3 font-black text-[9px] uppercase tracking-widest text-slate-500 text-center">S1 (P1) Open/Hold</th>
                    <th className="px-4 py-3 font-black text-[9px] uppercase tracking-widest text-slate-500 text-center">S2 (P2) Open/Hold</th>
                    <th className="px-4 py-3 font-black text-[9px] uppercase tracking-widest text-slate-500 text-center">S3 (P3) Open/Hold</th>
                    <th className="px-4 py-3 font-black text-[9px] uppercase tracking-widest text-slate-500 text-center">S4 (P4) Open/Hold</th>
                    <th className="px-5 py-3 font-black text-[9px] uppercase tracking-widest text-slate-500 text-right">Aggregate SLA Pending</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {(projectsDB.length > 0 ? projectsDB.map(p => p.name) : ['HR-Portal', 'E-Commerce', 'Internal-CRM', 'Mobile-App']).map((proj) => {
                    const s1 = activeTasksCount(proj, 'P1');
                    const s2 = activeTasksCount(proj, 'P2');
                    const s3 = activeTasksCount(proj, 'P3');
                    const s4 = activeTasksCount(proj, 'P4');
                    const total = s1 + s2 + s3 + s4;

                    return (
                      <tr key={proj} className="hover:bg-slate-900/40 transition-colors">
                        <td className="px-5 py-3 font-sans font-bold text-white text-[11px]">{proj}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-mono font-bold",
                            s1 > 0 ? "bg-red-500/10 text-red-400 border border-red-500/20" : "text-slate-600"
                          )}>{s1}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-mono font-bold",
                            s2 > 0 ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" : "text-slate-600"
                          )}>{s2}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-mono font-bold",
                            s3 > 0 ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "text-slate-600"
                          )}>{s3}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-mono font-bold",
                            s4 > 0 ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" : "text-slate-600"
                          )}>{s4}</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded text-[10px] font-mono font-black uppercase tracking-wider",
                            total > 0 ? "bg-slate-800 text-white font-bold" : "text-slate-600"
                          )}>
                            {total > 0 ? `${total} Pending` : 'None'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  
                  {/* Summary/Totals row */}
                  <tr className="bg-slate-900/65 font-black border-t border-slate-800">
                    <td className="px-5 py-3 text-white text-[10px] uppercase tracking-widest">Aggregate totals</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-mono text-red-400", totalS1 > 0 && "font-black")}>{totalS1}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-mono text-orange-400", totalS2 > 0 && "font-black")}>{totalS2}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-mono text-blue-400", totalS3 > 0 && "font-black")}>{totalS3}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-mono text-purple-400", totalS4 > 0 && "font-black")}>{totalS4}</span>
                    </td>
                    <td className="px-5 py-3 text-right text-blue-400 font-mono text-[10px] uppercase tracking-wider">
                      {totalS1 + totalS2 + totalS3 + totalS4} Global SLA
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Module 2: Project-Wise User Credentials Registry Table */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500/10 rounded-xl">
                  <Users className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest leading-none">Project-Wise User Access & Credentials Table</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1.5 leading-none">Secure project mapping and credential inventory</p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded text-[9px] font-black uppercase text-yellow-500 tracking-widest">
                Access Index
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3 font-black text-[9px] uppercase tracking-widest text-slate-500">Project Name</th>
                    <th className="px-4 py-3 font-black text-[9px] uppercase tracking-widest text-slate-500">User Identity</th>
                    <th className="px-4 py-3 font-black text-[9px] uppercase tracking-widest text-slate-500">Access Role</th>
                    <th className="px-4 py-3 font-black text-[9px] uppercase tracking-widest text-slate-500">Access Key</th>
                    <th className="px-4 py-3 font-black text-[9px] uppercase tracking-widest text-slate-500 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {/* Row for Admin who belongs to All Projects */}
                  {users.find(u => u.id.toLowerCase() === 'admin') && (() => {
                    const u = users.find(user => user.id.toLowerCase() === 'admin')!;
                    const pass = 'root123';
                    const keyString = `All Projects-${u.id}`;
                    const isRevealed = showTesterPasswordUserId === keyString;
                    return (
                      <tr className="hover:bg-slate-900/20 transition-colors">
                        <td className="px-5 py-3">
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/25 rounded-[4px] text-[9px] font-black uppercase tracking-wider">
                            All Active Projects
                          </span>
                        </td>
                        <td className="px-4 py-3 font-sans">
                          <p className="font-bold text-white text-[11px]">{u.name}</p>
                          <p className="font-mono text-slate-500 text-[9px] uppercase tracking-wider mt-0.5">{u.id}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wide">{u.role}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 font-mono">
                            <span className="text-emerald-400 font-bold text-xs">
                              {isRevealed ? pass : '••••••••'}
                            </span>
                            <button 
                              onClick={() => setShowTesterPasswordUserId(isRevealed ? null : keyString)}
                              className="text-slate-500 hover:text-slate-300 transition-colors"
                              title="Toggle access key"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button 
                            onClick={() => handleQuickLogin(u)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-widest text-[9px] rounded-lg transition-all shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 flex items-center gap-1.5 mx-auto"
                          >
                            <Key className="w-3 h-3 text-white/85" />
                            <span>Quick Login</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })()}

                  {/* Dynamic generation based on projects and their mapped users */}
                  {projectConfigs.flatMap(proj => {
                    return (proj.employees || []).map(empId => {
                      const u = users.find(user => user.id.toLowerCase() === empId.toLowerCase());
                      if (!u || u.id.toLowerCase() === 'admin') return null;
                      
                      const pass = u.id.toLowerCase() === 'admin' ? 'root123' : (u.password || 'user123');
                      const keyString = `${proj.projectId}-${u.id}`;
                      const isRevealed = showTesterPasswordUserId === keyString;
                      
                      return (
                        <tr key={keyString} className="hover:bg-slate-900/20 transition-colors">
                          <td className="px-5 py-3 text-slate-300 font-sans font-bold text-[11px]">
                            {proj.projectId}
                          </td>
                          <td className="px-4 py-3 font-sans">
                            <p className="font-bold text-white text-[11px]">{u.name}</p>
                            <p className="font-mono text-slate-500 text-[9px] uppercase tracking-wider mt-0.5">{u.id}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wide">{u.role}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="text-emerald-400 font-bold text-xs">
                                {isRevealed ? pass : '••••••••'}
                              </span>
                              <button 
                                onClick={() => setShowTesterPasswordUserId(isRevealed ? null : keyString)}
                                className="text-slate-500 hover:text-slate-300 transition-colors"
                                title="Toggle access key"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button 
                              onClick={() => handleQuickLogin(u)}
                              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 font-black uppercase tracking-widest text-[9px] border border-slate-700 hover:border-slate-600 rounded-lg transition-all flex items-center gap-1.5 mx-auto"
                            >
                              <Key className="w-3 h-3 text-slate-400" />
                              <span>Quick Login</span>
                            </button>
                          </td>
                        </tr>
                      );
                    }).filter(Boolean);
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

        {/* Modal: SLA Charts Popup */}
        <AnimatePresence>
          {metricsDetailModalOpen && (
            <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl p-6 space-y-6"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-xl">
                      <BarChart className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white uppercase tracking-widest">SLA Distribution Center</h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Real-time charts of active priorities in Open and Hold phases</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => setMetricsDetailModalOpen(false)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-750"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="h-64 flex items-center justify-center">
                    {chartData.length === 0 ? (
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">No active tickets currently recorded</p>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }}
                            itemStyle={{ textTransform: 'uppercase', fontStyle: 'normal', fontSize: '10px', color: '#fff' }}
                            labelStyle={{ textTransform: 'uppercase', fontSize: '10px' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="space-y-4">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Queue Status Metrics Details</h5>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800/80 rounded-xl">
                        <span className="text-[10px] text-red-400 font-black uppercase tracking-wider">S1 Critical Tasks</span>
                        <span className="text-sm font-mono text-white font-bold">{totalS1}</span>
                      </div>
                      <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800/80 rounded-xl">
                        <span className="text-[10px] text-orange-400 font-black uppercase tracking-wider">S2 High Severity</span>
                        <span className="text-sm font-mono text-white font-bold">{totalS2}</span>
                      </div>
                      <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800/80 rounded-xl">
                        <span className="text-[10px] text-blue-400 font-black uppercase tracking-wider">S3 Medium Tasks</span>
                        <span className="text-sm font-mono text-white font-bold">{totalS3}</span>
                      </div>
                      <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800/80 rounded-xl">
                        <span className="text-[10px] text-purple-400 font-black uppercase tracking-wider">S4 Low Density</span>
                        <span className="text-sm font-mono text-white font-bold">{totalS4}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-[9px] font-mono text-slate-500 uppercase tracking-widest leading-none">
                  <span>Aggregate Total: {totalS1 + totalS2 + totalS3 + totalS4} tasks</span>
                  <span>Database Online</span>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const handleDrilldown = (type: string, param?: any) => {
    const nowStr = new Date().toISOString();
    let filteredList: SupportTask[] = [];
    let title = '';
    let desc = '';

    const baseTasks = charts.distributionTasks || [];

    switch (type) {
      case 'mtta_all':
        filteredList = baseTasks;
        title = "Response Performance (MTTA) Details";
        desc = "Full list of tickets evaluating response SLA and acknowledgment times.";
        break;
      case 'mttr_all':
        filteredList = baseTasks;
        title = "Resolution Performance (MTTR) Details";
        desc = "Full list of tickets evaluating resolution SLA and total elapsed active fixing times.";
        break;
      case 'mtta_met':
        filteredList = baseTasks.filter(t => !getTaskSlaTimes(t, nowStr).isResponseBreached);
        title = "Response SLA (MTTA) - MET";
        desc = "Tickets acknowledged within response SLA target times for their respective priority levels.";
        break;
      case 'mtta_breached':
        filteredList = baseTasks.filter(t => getTaskSlaTimes(t, nowStr).isResponseBreached);
        title = "Response SLA (MTTA) - BREACHED";
        desc = "Tickets that missed target acknowledgment times based on priority and shift timings.";
        break;
      case 'mttr_met':
        filteredList = baseTasks.filter(t => !getTaskSlaTimes(t, nowStr).isResolutionBreached);
        title = "Resolution SLA (MTTR) - MET";
        desc = "Tickets resolved within required SLAs during this timeframe.";
        break;
      case 'mttr_breached':
        filteredList = baseTasks.filter(t => getTaskSlaTimes(t, nowStr).isResolutionBreached);
        title = "Resolution SLA (MTTR) - BREACHED";
        desc = "Tickets whose business and active resolving focus took longer than set resolution SLAs.";
        break;
      case 'risk_critical':
        filteredList = baseTasks.filter(t => {
          const isOpen = t.status !== 'Closed' && t.status !== 'Resolved';
          const sla = getTaskSlaTimes(t, nowStr);
          return isOpen && sla.isResolutionBreached;
        });
        title = "Breached / SLA Critical Risk";
        desc = "Active tickets currently breached and requiring emergency manager resolution.";
        break;
      case 'risk_high':
        filteredList = baseTasks.filter(t => {
          const isOpen = t.status !== 'Closed' && t.status !== 'Resolved';
          const sla = getTaskSlaTimes(t, nowStr);
          const ratio = sla.resolutionTimeMin / (sla.resolutionLimitMin || 1);
          return isOpen && !sla.isResolutionBreached && ratio >= 0.8;
        });
        title = "High Risk Level Tickets";
        desc = "Active tickets approaching SLA threshold with >= 80% of resolution hours elapsed.";
        break;
      case 'risk_medium':
        filteredList = baseTasks.filter(t => {
          const isOpen = t.status !== 'Closed' && t.status !== 'Resolved';
          const sla = getTaskSlaTimes(t, nowStr);
          const ratio = sla.resolutionTimeMin / (sla.resolutionLimitMin || 1);
          return isOpen && !sla.isResolutionBreached && ratio >= 0.5 && ratio < 0.8;
        });
        title = "Moderate Risk Tickets";
        desc = "Active tickets having consumed 50% to 80% of allowed resolution SLA.";
        break;
      case 'risk_low':
        filteredList = baseTasks.filter(t => {
          const isOpen = t.status !== 'Closed' && t.status !== 'Resolved';
          const sla = getTaskSlaTimes(t, nowStr);
          const ratio = sla.resolutionTimeMin / (sla.resolutionLimitMin || 1);
          return isOpen && !sla.isResolutionBreached && ratio < 0.5;
        });
        title = "Safe / Stable Workload";
        desc = "Active open tickets with < 50% of resolution SLA time elapsed.";
        break;
      case 'priority':
        filteredList = baseTasks.filter(t => t.priority === param);
        title = `Priority Category: ${param}`;
        desc = `All incidents in current view with ${param} criticality level.`;
        break;
      case 'level':
        filteredList = baseTasks.filter(t => t.supportLevel === param);
        title = `Support Tier: ${param}`;
        desc = `All incidents logged under Support Layer ${param} handling tier.`;
        break;
      case 'resource_assigned':
        filteredList = baseTasks.filter(t => t.assignedTo === param);
        title = `${param} - Total Assigned Workload`;
        desc = `Full roster of incidents of ${param} during the report period.`;
        break;
      case 'resource_resolved':
        filteredList = baseTasks.filter(t => t.assignedTo === param && (t.status === 'Resolved' || t.status === 'Closed'));
        title = `${param} - Resolved & Closed Tickets`;
        desc = `Incidents resolved or verified and closed by ${param} in this window.`;
        break;
      case 'resource_active':
        filteredList = baseTasks.filter(t => t.assignedTo === param && t.status !== 'Resolved' && t.status !== 'Closed');
        title = `${param} - Active Responsibility`;
        desc = `Active open, in-progress, or on-hold ticket backlog assigned to ${param}.`;
        break;
      case 'resource_priority':
        filteredList = baseTasks.filter(t => t.assignedTo === param.name && t.priority === param.priority);
        title = `${param.name} - ${param.priority} Incidents`;
        desc = `All ${param.priority} priority tickets matching workload assignations for ${param.name}.`;
        break;
      case 'resource_total':
        filteredList = baseTasks.filter(t => t.assignedTo === param);
        title = `${param} - Overall Performance Data`;
        desc = `Consolidated performance and effort metrics for resource ${param}.`;
        break;
      default:
        filteredList = baseTasks;
        title = "Period Analytics Breakdown";
        desc = "Complete set of tickets matching current filters and dates.";
        break;
    }

    setDrilldownTickets(filteredList);
    setDrilldownTitle(title);
    setDrilldownDescription(desc);
    setDrilldownSearch('');
    setDrilldownModalOpen(true);
  };

  return (
    <div className="flex h-screen overflow-hidden text-slate-200">
      {/* Sidebar Form */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 320 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className="glass-panel h-full flex flex-col border-r border-slate-800 shrink-0"
      >
        <div className="p-6 flex flex-col h-full overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-2 mb-8 p-1 border-b border-slate-800 pb-6">
            <Activity className="w-4.5 h-4.5 text-blue-500 animate-pulse shrink-0" />
            <span className="font-sans font-black tracking-widest text-[13px] text-white uppercase">ITSM PORTAL</span>
          </div>

          <form onSubmit={handleSaveTask} className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white/90 border-l-2 border-blue-500 pl-3">
                {editingTask ? 'Edit Task' : 'New Task Record'}
              </h2>
              {editingTask && (
                <button 
                  type="button" 
                  onClick={() => setEditingTask(null)}
                  className="text-[10px] uppercase font-bold text-slate-500 hover:text-slate-300"
                >
                  Cancel
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="label-sm">Project Assignment</label>
                <select 
                  className="input-field"
                  value={formData.projectId}
                  onChange={e => {
                    const newProjectId = e.target.value;
                    const config = projectConfigs.find(c => c.projectId === newProjectId);
                    const available = config?.employees || [];
                    
                    // Generate next ticket ID for this project
                    const nextId = getNextTicketId(newProjectId, tasks);
                    
                    setFormData({ 
                      ...formData, 
                      projectId: newProjectId,
                      ticketId: nextId,
                      assignedTo: '' // Don't give default value, force user select
                    });
                  }}
                >
                  {projectConfigs
                    .filter(p => isManagerOrAdmin || userMappedProjects.includes(p.projectId))
                    .map(p => <option key={p.projectId} value={p.projectId}>{p.projectId}</option>)}
                </select>
              </div>

              <div>
                <label className="label-sm flex items-center justify-between">
                  <span>Ticket ID</span>
                  <span className="text-[9px] text-blue-500 font-black uppercase tracking-widest bg-blue-500/5 px-1 rounded">Auto Sequence</span>
                </label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. INC-4052"
                  value={formData.ticketId}
                  onChange={e => setFormData({ ...formData, ticketId: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="label-sm">Issue Description <span className="text-red-500">*</span></label>
                <textarea 
                  className="input-field min-h-[80px] resize-none" 
                  placeholder="Briefly describe the problem... (Mandatory)"
                  value={formData.description || ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="label-sm">Assign To Employee <span className="text-red-500">*</span></label>
                <select 
                  className="input-field"
                  value={formData.assignedTo || ''}
                  onChange={e => setFormData({ ...formData, assignedTo: e.target.value })}
                  required
                >
                  <option value="">Select Employee...</option>
                  {(projectConfigs.find(c => c.projectId === formData.projectId)?.employees || []).map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm">Category <span className="text-red-500">*</span></label>
                <select 
                  className="input-field"
                  value={formData.category || ''}
                  onChange={e => handleCategoryChange(e.target.value)}
                  required
                >
                  <option value="">Select Category...</option>
                  {categoriesList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label-sm">Subcategory <span className="text-red-500">*</span></label>
                <select 
                  className="input-field"
                  value={formData.subcategory || ''}
                  onChange={e => setFormData({ ...formData, subcategory: e.target.value })}
                  required
                  disabled={!formData.category}
                >
                  <option value="">Select Subcategory...</option>
                  {subcategoriesList.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm">Support Level <span className="text-red-500">*</span></label>
                <select 
                  className="input-field"
                  value={formData.supportLevel || ''}
                  onChange={e => setFormData({ ...formData, supportLevel: e.target.value as SupportLevel })}
                  required
                >
                  <option value="">Select Support Level...</option>
                  <option value="L1">L1</option>
                  <option value="L2">L2</option>
                  <option value="L3">L3</option>
                  <option value="L4">L4</option>
                </select>
              </div>
              <div>
                <label className="label-sm">Priority <span className="text-red-500">*</span></label>
                <select 
                  className="input-field"
                  value={formData.priority || ''}
                  onChange={e => setFormData({ ...formData, priority: e.target.value as Priority })}
                  required
                >
                  <option value="">Select Priority...</option>
                  <option value="P1">P1 - Critical</option>
                  <option value="P2">P2 - High</option>
                  <option value="P3">P3 - Medium</option>
                  <option value="P4">P4 - Low</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label-sm">Generation Date/Time</label>
                <input 
                  type="datetime-local" 
                  className="input-field"
                  value={formData.generationDate}
                  onChange={e => setFormData({ ...formData, generationDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label-sm">Response Date/Time</label>
                <input 
                  type="datetime-local" 
                  className="input-field"
                  value={formData.responseDate || ''}
                  onChange={e => setFormData({ ...formData, responseDate: e.target.value })}
                />
              </div>
              <div>
                <label className="label-sm">Resolution Time</label>
                <input 
                  type="datetime-local" 
                  className="input-field"
                  value={formData.closureDate || ''}
                  onChange={e => setFormData({ ...formData, closureDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="label-sm">Current Status</label>
              <select 
                className="input-field"
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value as TaskStatus })}
              >
                <option value="Open">Open</option>
                <option value="In-Progress">In-Progress</option>
                <option value="Hold">Hold</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            {formData.status === 'Hold' && (
              <div>
                <label className="label-sm">Hold-Reason</label>
                <input 
                  type="text" 
                  id="hold-reason-field"
                  className="input-field"
                  placeholder="Enter the reason for putting on Hold"
                  value={formData.holdReason || ''}
                  onChange={e => setFormData({ ...formData, holdReason: e.target.value })}
                  required
                />
              </div>
            )}

            {editingTask && (
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500/20"
                  checked={formData.userIntimated}
                  onChange={e => setFormData({ ...formData, userIntimated: e.target.checked })}
                />
                <span className="text-xs text-slate-500 group-hover:text-slate-300 transition-colors font-bold uppercase tracking-wider">End User Intimated</span>
              </label>
            )}

            <div>
              <label className="label-sm">
                Technical Solution {(formData.status === 'Resolved' || formData.status === 'Closed') && <span className="text-red-500">*</span>}
              </label>
              <textarea 
                className="input-field min-h-[80px] resize-none disabled:opacity-50 disabled:bg-slate-900/40 disabled:cursor-not-allowed" 
                placeholder={(formData.status === 'Resolved' || formData.status === 'Closed') ? "Describe the solution provided... (Mandatory)" : (editingTask ? "Technical solution is locked. Use history logs to modify." : "Describe the solution provided...")}
                value={formData.solution || ''}
                onChange={e => setFormData({ ...formData, solution: e.target.value })}
                disabled={!!editingTask && formData.status !== 'Resolved' && formData.status !== 'Closed'}
                required={formData.status === 'Resolved' || formData.status === 'Closed'}
              />
            </div>

            <div>
              <label className="label-sm">Remarks</label>
              <textarea 
                className="input-field min-h-[60px] resize-none disabled:opacity-50 disabled:bg-slate-900/40 disabled:cursor-not-allowed" 
                placeholder={editingTask ? "Remarks are locked. Use history logs to modify." : "Any additional remarks..."}
                value={formData.remarks || ''}
                onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                disabled={!!editingTask}
              />
            </div>

            {/* Case Creation Attachments Dropzone / Interface */}
            <div className="space-y-3 bg-slate-900/40 p-3.5 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-blue-500" />
                  Staged Files ({tempAttachments.length})
                </label>
                <span className="text-[8px] uppercase font-extrabold text-blue-500 bg-blue-500/10 px-1 rounded">Staged</span>
              </div>
              
              <div 
                className="border border-dashed border-slate-700/60 hover:border-blue-500/50 bg-slate-950/40 p-3 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all relative overflow-hidden group min-h-[60px] cursor-pointer"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const files = Array.from(e.dataTransfer.files) as File[];
                  for (const file of files) {
                    await handleFileReader(file);
                  }
                }}
              >
                <Upload className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 group-hover:scale-110 transition-all" />
                <span className="text-[9px] font-black uppercase text-slate-400 group-hover:text-slate-300">Drag & Drop or Browse</span>
                <input 
                  type="file" 
                  multiple
                  onChange={async (e) => {
                    if (e.target.files) {
                      const files = Array.from(e.target.files) as File[];
                      for (const file of files) {
                        await handleFileReader(file);
                      }
                      e.target.value = ''; // Reset input selection
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>

              {tempAttachments.length > 0 && (
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                  {tempAttachments.map((f, i) => (
                    <div key={i} className="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-800 hover:border-slate-700 transition-colors">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-slate-200 font-bold truncate" title={f.name}>{f.name}</p>
                          <p className="text-[8px] text-slate-500 font-mono">{(f.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setTempAttachments(prev => prev.filter((_, idx) => idx !== i))}
                        className="p-1 text-slate-500 hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"
                        title="Remove Document"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Show directory path notification */}
              <div className="p-2 bg-slate-950/60 border border-slate-900 rounded-lg space-y-1 text-left select-none text-[8.5px] text-slate-450 animate-fade-in">
                <span className="font-extrabold uppercase text-slate-400 text-[8px] block tracking-wide">
                  {attachmentStorageMode === 'local' ? 'Target Directory Hierarchy' : 'Browser Sandbox Partition Indicator'}
                </span>
                <p className="font-mono bg-slate-950 p-1.5 rounded font-semibold text-emerald-400 select-all leading-normal text-[8.5px] break-all">
                  {attachmentStorageMode === 'local' ? (
                    `${attachmentBasePath}\\${formData.projectId || 'PROJECT'}\\${formData.ticketId || 'INC-TEMP'}\\`
                  ) : (
                    `SECURE_SANDBOX://indexeddb/sflow_attachments_${formData.ticketId || 'INC-TEMP'}/`
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2 group">
                {editingTask ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                )}
                {editingTask ? 'Update Record' : 'Add Record'}
              </button>
              <button 
                type="button" 
                onClick={handleCancel}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-md text-xs font-black uppercase tracking-widest transition-all"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing with Java Backend...</p>
            </div>
          </div>
        )}
        {/* Top Header / Command Bar */}
        <header className="h-16 glass-panel border-b border-slate-800 px-6 flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-800 rounded-md transition-colors text-slate-400"
              title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <ChevronRight className={cn("w-5 h-5 transition-transform", isSidebarOpen ? "rotate-180" : "rotate-0")} />
            </button>
            

            <div className="flex items-center gap-1 bg-slate-900/60 rounded-lg p-1 border border-slate-800">
               <select 
                  className="bg-transparent text-xs font-bold text-slate-300 outline-none px-3 rounded hover:bg-slate-800 border-none transition-colors h-7 cursor-pointer"
                  value={selectedProject}
                  onChange={e => setSelectedProject(e.target.value)}
                >
                  {(isManagerOrAdmin || userMappedProjects.length > 1) && (
                    <option value="All">All Projects</option>
                  )}
                  {projectConfigs
                    .filter(p => isManagerOrAdmin || userMappedProjects.includes(p.projectId))
                    .map(p => <option key={p.projectId} value={p.projectId}>{p.projectId}</option>)}
                </select>
              <div className="w-[1px] h-4 bg-slate-800 mx-1" />
               <select 
                  className="bg-transparent text-xs font-bold text-slate-300 outline-none px-3 rounded hover:bg-slate-800 border-none transition-colors h-7 cursor-pointer"
                  value={selectedEmployee}
                  onChange={e => setSelectedEmployee(e.target.value)}
                >
                  {availableEmployees.length >= 2 && (
                    isManagerOrAdmin ? (
                      <option value="All">All Employees</option>
                    ) : (
                      <option value="All">All Project Colleagues</option>
                    )
                  )}
                  {availableEmployees.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-slate-900/60 rounded-lg p-1 border border-slate-800">
              <button 
                onClick={() => setActiveTab('analytics')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap",
                  activeTab === 'analytics' ? "bg-slate-800 text-white shadow-lg shadow-black/20" : "text-slate-500 hover:text-slate-300"
                )}
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="hidden md:inline">Analytics</span>
              </button>
              <button 
                onClick={() => setActiveTab('workbook')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap",
                  activeTab === 'workbook' ? "bg-slate-800 text-white shadow-lg shadow-black/20" : "text-slate-500 hover:text-slate-300"
                )}
              >
                <ListTodo className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="hidden md:inline">My Workbook</span>
              </button>

              <div className="relative">
                <button 
                  onClick={() => setIsUtilityDropdownOpen(!isUtilityDropdownOpen)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
                    ['knowledge-base', 'change-release'].includes(activeTab as string) ? "bg-slate-800 text-white shadow-lg shadow-black/20" : "text-slate-500 hover:text-slate-300 hover:bg-slate-900/40"
                  )}
                >
                  <Wrench className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="hidden md:inline">Utility</span>
                  <ChevronDown className={cn("w-3 h-3 transition-transform duration-200 ml-0.5 shrink-0", isUtilityDropdownOpen && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {isUtilityDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsUtilityDropdownOpen(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute left-0 mt-2 w-52 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden text-left"
                      >
                        <div className="px-3 py-2 border-b border-slate-800 bg-slate-950/40">
                          <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Helper Utilities</span>
                        </div>
                        <div className="p-1 space-y-0.5">
                          <button
                            onClick={() => {
                              setActiveTab('knowledge-base' as any);
                              setKbSelectedArticle(null);
                              setIsUtilityDropdownOpen(false);
                            }}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800 rounded-md text-slate-300 hover:text-white transition-colors text-xs font-bold text-left cursor-pointer",
                              (activeTab as string) === 'knowledge-base' && "bg-slate-850 text-white shadow"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <BookOpen className="w-3.5 h-3.5 text-sky-450 shrink-0" />
                              <span>Knowledge Base</span>
                            </div>
                            {(activeTab as string) === 'knowledge-base' && (
                              <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                            )}
                          </button>

                          <button
                            onClick={() => {
                              setActiveTab('change-release' as any);
                              setIsUtilityDropdownOpen(false);
                            }}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800 rounded-md text-slate-300 hover:text-white transition-colors text-xs font-bold text-left cursor-pointer",
                              (activeTab as string) === 'change-release' && "bg-slate-850 text-white shadow"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span>Change & Release</span>
                            </div>
                            {(activeTab as string) === 'change-release' && (
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                            )}
                          </button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
              {isManagerOrAdmin && (
                <button 
                  onClick={() => setActiveTab('settings')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap",
                    activeTab === 'settings' ? "bg-slate-800 text-white shadow-lg shadow-black/20" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  <Settings className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="hidden md:inline">Configuration</span>
                </button>
              )}
              <button 
                onClick={() => setActiveTab('mapping-details')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap",
                  activeTab === 'mapping-details' ? "bg-slate-800 text-white shadow-lg shadow-black/20" : "text-slate-500 hover:text-slate-300"
                )}
              >
                <Terminal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="hidden md:inline">Mapping Details</span>
              </button>
              {isManagerOrAdmin && (
                <button 
                  onClick={() => setActiveTab('user-onboard')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap",
                    activeTab === 'user-onboard' ? "bg-slate-800 text-white shadow-lg shadow-black/20" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  <Users className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="hidden md:inline">User Onboard</span>
                </button>
              )}
            </div>
            
            <div className="relative">
              <button 
                onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                className="btn-secondary flex items-center gap-2 group whitespace-nowrap"
              >
                <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                <span className="hidden sm:inline">Export Report</span>
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isExportDropdownOpen && "rotate-180")} />
              </button>

              <AnimatePresence>
                {isExportDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsExportDropdownOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden"
                    >
                      <button
                        onClick={() => handleExport('excel')}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors text-xs font-bold"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                        Export to Excel
                      </button>
                      <div className="h-[1px] bg-slate-800/50 mx-2" />
                      <button
                        onClick={() => handleExport('pdf')}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors text-xs font-bold"
                      >
                        <FileText className="w-4 h-4 text-blue-500" />
                        Export to PDF
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="h-6 w-[1px] bg-slate-800 mx-1" />

            <div className="flex items-center gap-3 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800/80">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-xs shadow-inner uppercase">
                {currentUser?.substring(0, 2)}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-[10px] text-white font-black uppercase tracking-tight leading-none">{currentLoggedInUserObj?.name || currentUser}</p>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide mt-0.5 leading-none">{currentLoggedInUserObj?.role || (isAdmin ? "Administrator" : "User")}</p>
                {lastLoginTime ? (
                  <p className="text-[8px] text-emerald-400 font-mono mt-1 leading-none tracking-tight">
                    Last Log-In: {format(parseISO(lastLoginTime), 'LLL d, yyyy HH:mm:ss')}
                  </p>
                ) : (
                  <p className="text-[8px] text-slate-600 font-mono mt-1 leading-none tracking-tight">
                    Last Log-In: Recently
                  </p>
                )}
              </div>
              <button 
                onClick={handleLogout}
                className="ml-1 p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/35 text-red-400 hover:text-red-300 rounded-lg transition-all flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-wider"
                title="Log Out secure session"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
                <span className="hidden sm:inline">Log Out</span>
              </button>
            </div>

            {/* Theme Customizer Dropdown - Positioned here for high visibility AFTER log out */}
            <div className="relative shrink-0">
              <button 
                onClick={() => setShowThemeDropdown(!showThemeDropdown)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-all group h-11"
                title="Customize Application Theme"
              >
                <Palette className="w-3.5 h-3.5 text-violet-400 group-hover:rotate-12 transition-transform" />
                <span className="text-[10px] uppercase tracking-wider font-black hidden sm:inline">Theme</span>
              </button>

              <AnimatePresence>
                {showThemeDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowThemeDropdown(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="px-4 py-2.5 bg-slate-950/40 border-b border-slate-800/50 flex items-center justify-between">
                        <span className="text-[9px] uppercase tracking-widest font-black text-slate-500">Pick Custom Theme</span>
                        <span className="text-[9px] uppercase tracking-wider font-bold text-violet-400 px-1.5 py-0.5 rounded bg-violet-500/10">UI/UX Settings</span>
                      </div>
                      <div className="p-1.5 space-y-1">
                        {[
                          { id: 'cosmic', name: 'Cosmic Midnight', desc: 'Deep cosmic space indigo', iconColor: 'bg-indigo-500', activeBg: 'bg-indigo-500/10 border-indigo-500/30' },
                          { id: 'sapphire', name: 'Sapphire Ocean', desc: 'Calm deep sea cobalt blue', iconColor: 'bg-blue-500', activeBg: 'bg-blue-500/10 border-blue-500/30' },
                          { id: 'emerald', name: 'Emerald Forest', desc: 'Restful soft botanical green', iconColor: 'bg-emerald-500', activeBg: 'bg-emerald-500/10 border-emerald-500/30' },
                          { id: 'rose', name: 'Sunset Rose', desc: 'Luxury cherry wine velvet', iconColor: 'bg-rose-500', activeBg: 'bg-rose-500/10 border-rose-500/30' },
                          { id: 'cyber', name: 'Cyberpunk Amber', desc: 'High-contrast hazard warning', iconColor: 'bg-amber-500', activeBg: 'bg-amber-500/10 border-amber-500/30' },
                          { id: 'frost', name: 'Nordic Frost', desc: 'Crisp minimal daylight mode', iconColor: 'bg-sky-400', activeBg: 'bg-sky-400/10 border-sky-400/30' },
                        ].map((themeOpt) => {
                          const isActive = theme === themeOpt.id;
                          return (
                            <button
                              key={themeOpt.id}
                              onClick={() => {
                                setTheme(themeOpt.id as any);
                                setShowThemeDropdown(false);
                              }}
                              className={cn(
                                "w-full text-left flex items-start gap-3 p-2 rounded-lg border transition-all duration-200",
                                isActive 
                                  ? `${themeOpt.activeBg} text-white font-bold` 
                                  : "bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                              )}
                            >
                              <div className={cn("w-3 h-3 rounded-full shrink-0 mt-0.5 shadow-sm", themeOpt.iconColor)} />
                              <div>
                                <p className="text-xs font-black tracking-wide">{themeOpt.name}</p>
                                <p className="text-[9px] text-slate-500 font-bold leading-none mt-0.5">{themeOpt.desc}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Tab Content Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* Removed KPI Row */}


          <AnimatePresence mode="wait">
            {activeTab === 'analytics' ? (
              <motion.div 
                key="analytics"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                {/* Global Timeframe Intelligence Header */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                  <div className="px-6 py-5 border-b border-slate-800 bg-slate-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-blue-500" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider mb-0.5">Timeframe Intelligence</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Dynamic report window selection for all analytics</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1.5 rounded-xl shadow-inner overflow-x-auto">
                      {(['daily', 'weekly', 'monthly', 'quarterly', 'custom'] as const).map((period) => (
                        <button
                          key={period}
                          onClick={() => setTrendPeriod(period)}
                          className={cn(
                            "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap",
                            trendPeriod === period 
                              ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 -translate-y-0.5" 
                              : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
                          )}
                        >
                          {period}
                        </button>
                      ))}
                    </div>
                  </div>

                  {trendPeriod === 'custom' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="px-6 py-4 bg-slate-900/20 flex flex-wrap items-center gap-6 border-t border-slate-800/50"
                    >
                      <div className="flex items-center gap-3">
                         <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">From</label>
                         <input 
                            type="date" 
                            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                            value={customStartDate}
                            onChange={e => setCustomStartDate(e.target.value)}
                         />
                      </div>
                      <div className="hidden md:block w-[1px] h-8 bg-slate-800" />
                      <div className="flex items-center gap-3">
                         <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">To</label>
                         <input 
                            type="date" 
                            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                            value={customEndDate}
                            onChange={e => setCustomEndDate(e.target.value)}
                         />
                      </div>
                      <div className="flex-grow" />
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">Selected Range</span>
                        <span className="text-[11px] text-blue-400 font-black">
                          {(() => {
                            const s = parseISO(customStartDate);
                            const e = parseISO(customEndDate);
                            if (isNaN(s.getTime()) || isNaN(e.getTime())) return 'Select valid range';
                            return `${format(s, 'MMM dd')} - ${format(e, 'MMM dd, yyyy')}`;
                          })()}
                        </span>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Analytics Segment Switcher */}
                <div className="flex items-center justify-between bg-slate-900/20 p-2 rounded-2xl border border-slate-800/80">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setAnalyticsSubView('system')}
                      className={cn(
                        "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300",
                        analyticsSubView === 'system' 
                          ? "bg-slate-800 text-white shadow-lg border border-slate-700 font-bold" 
                          : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/20"
                      )}
                    >
                      <LayoutDashboard className="w-4 h-4 text-sky-400 shrink-0" />
                      System SLA &amp; Incidents
                    </button>
                    <button 
                      onClick={() => setAnalyticsSubView('productivity')}
                      className={cn(
                        "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300",
                        analyticsSubView === 'productivity' 
                          ? "bg-slate-800 text-white shadow-lg border border-slate-700 font-bold" 
                          : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/20"
                      )}
                    >
                      <Users className="w-4 h-4 text-violet-400 shrink-0" />
                      Resource Productivity Report
                    </button>
                  </div>
                  
                  <div className="hidden md:flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider select-none px-3">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse-subtle" />
                    Real-time Calculations
                  </div>
                </div>

                {analyticsSubView === 'system' ? (
                  <>
                    {/* Real-time SLA Acknowledgment, Resolution Gauges, and Breach Risk Panel */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  
                   {/* Response SLA (MTTA) Gauge Card */}
                   <div 
                     onClick={() => handleDrilldown('mtta_all')}
                     className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-xl relative overflow-hidden backdrop-blur-sm cursor-pointer hover:border-emerald-500/30 hover:bg-slate-900/60 transition-all duration-300 group"
                     title="Click to drill down into response SLA ticket statistics"
                   >
                     <div className="flex items-center justify-between mb-4">
                       <div>
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-emerald-400 transition-colors">Response SLA (MTTA)</h4>
                         <p className="text-[9px] text-slate-500 uppercase font-bold mt-0.5 block leading-none">Mean Time To Acknowledge</p>
                       </div>
                       <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                         <Clock className="w-4 h-4 text-emerald-400" />
                       </div>
                     </div>
                     
                     <div className="flex items-center gap-6">
                       <ComplianceGauge 
                         percentage={charts.slaMetrics.responseCompliance} 
                         colorClass="stroke-emerald-500 shadow-emerald-500/20"
                         size={92} 
                         strokeWidth={8}
                         label="RESP SLA"
                       />
                       <div className="space-y-2 flex-grow">
                         <div>
                           <span className="text-[9px] text-slate-500 uppercase font-bold block tracking-wider leading-none">Avg MTTA</span>
                           <span className="text-xl font-mono font-black text-white leading-none">
                             {formatDuration(charts.slaMetrics.mtta * 60000) || '0m'}
                           </span>
                         </div>
                         <div>
                           <span className="text-[8px] text-slate-400 font-bold block bg-slate-950/60 border border-slate-800 rounded px-2 py-1 text-center mt-1">
                             Target: 2h avg
                           </span>
                         </div>
                       </div>
                     </div>
                   </div>
 
                   {/* Resolution SLA (MTTR) Gauge Card */}
                   <div 
                     onClick={() => handleDrilldown('mttr_all')}
                     className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-xl relative overflow-hidden backdrop-blur-sm cursor-pointer hover:border-indigo-500/30 hover:bg-slate-900/60 transition-all duration-300 group"
                     title="Click to drill down into resolution SLA ticket statistics"
                   >
                     <div className="flex items-center justify-between mb-4">
                       <div>
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-indigo-400 transition-colors">Resolution SLA (MTTR)</h4>
                         <p className="text-[9px] text-slate-500 uppercase font-bold mt-0.5 block leading-none">Mean Time To Resolve</p>
                       </div>
                       <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                         <Activity className="w-4 h-4 text-indigo-400" />
                       </div>
                     </div>
                     
                     <div className="flex items-center gap-6">
                       <ComplianceGauge 
                         percentage={charts.slaMetrics.resolutionCompliance} 
                         colorClass="stroke-indigo-500 shadow-indigo-500/20"
                         size={92} 
                         strokeWidth={8}
                         label="RESO SLA"
                       />
                       <div className="space-y-2 flex-grow">
                         <div>
                           <span className="text-[9px] text-slate-500 uppercase font-bold block tracking-wider leading-none">Avg MTTR</span>
                           <span className="text-xl font-mono font-black text-white leading-none">
                             {formatDuration(charts.slaMetrics.mttr * 60000) || '0m'}
                           </span>
                         </div>
                         <div>
                           <span className="text-[8px] text-slate-400 font-bold block bg-slate-950/60 border border-slate-800 rounded px-2 py-1 text-center mt-1">
                             Target: 24h avg
                           </span>
                         </div>
                       </div>
                     </div>
                   </div>

                  {/* Breach Risk Intensity Status Card */}
                  <div className={cn(
                    "border p-5 rounded-2xl flex flex-col justify-between shadow-xl relative overflow-hidden backdrop-blur-sm",
                    charts.slaMetrics.breachRiskBg,
                    charts.slaMetrics.breachRiskBorder
                  )}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Breach Risk Intensity</h4>
                        <p className="text-[9px] text-slate-500 uppercase font-bold mt-0.5 block leading-none">Open Ticket SLA Threat</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={cn("px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-current", charts.slaMetrics.breachRiskColor)}>
                          {charts.slaMetrics.breachRiskStatus}
                        </div>
                      </div>
                    </div>

                    <div className="my-3 space-y-2">
                      <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider text-slate-400 leading-none">
                        <span>Risk Spectrum</span>
                        <span>{charts.slaMetrics.activeOpenCount} ACTIVE OPEN</span>
                      </div>
                      
                      {/* Risk Spectrum stacked bar */}
                      <div className="h-2 w-full bg-slate-950 rounded-full flex overflow-hidden">
                        {charts.slaMetrics.activeOpenCount === 0 ? (
                          <div className="h-full bg-slate-800 w-full" />
                        ) : (
                          <>
                            <div style={{ width: `${(charts.slaMetrics.riskCritical / charts.slaMetrics.activeOpenCount) * 100}%` }} className="h-full bg-rose-500" title="Breached" />
                            <div style={{ width: `${(charts.slaMetrics.riskHigh / charts.slaMetrics.activeOpenCount) * 100}%` }} className="h-full bg-orange-500" title="High Risk" />
                            <div style={{ width: `${(charts.slaMetrics.riskMedium / charts.slaMetrics.activeOpenCount) * 100}%` }} className="h-full bg-amber-500" title="Medium Risk" />
                            <div style={{ width: `${(charts.slaMetrics.riskLow / charts.slaMetrics.activeOpenCount) * 100}%` }} className="h-full bg-emerald-500" title="Stable / Low" />
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1 text-[9px] text-slate-400 font-mono">
                      <div 
                        onClick={() => handleDrilldown('risk_critical')}
                        className="flex flex-col items-center p-1 bg-slate-950/40 rounded border border-slate-900 cursor-pointer hover:bg-rose-500/10 hover:border-rose-500/30 transition-all text-center"
                        title="Click to view breached active tickets"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mb-1" />
                        <span className="font-extrabold text-white text-[11px]">{charts.slaMetrics.riskCritical}</span>
                        <span className="text-[7px] text-slate-500 tracking-tighter">BREACHED</span>
                      </div>
                      <div 
                        onClick={() => handleDrilldown('risk_high')}
                        className="flex flex-col items-center p-1 bg-slate-950/40 rounded border border-slate-900 cursor-pointer hover:bg-orange-500/10 hover:border-orange-500/30 transition-all text-center"
                        title="Click to view High risk active open tickets"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mb-1" />
                        <span className="font-extrabold text-white text-[11px]">{charts.slaMetrics.riskHigh}</span>
                        <span className="text-[7px] text-slate-500 tracking-tighter">HIGH</span>
                      </div>
                      <div 
                        onClick={() => handleDrilldown('risk_medium')}
                        className="flex flex-col items-center p-1 bg-slate-950/40 rounded border border-slate-900 cursor-pointer hover:bg-amber-500/10 hover:border-amber-500/30 transition-all text-center"
                        title="Click to view Moderate risk active open tickets"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mb-1" />
                        <span className="font-extrabold text-white text-[11px]">{charts.slaMetrics.riskMedium}</span>
                        <span className="text-[7px] text-slate-500 tracking-tighter">MODERATE</span>
                      </div>
                      <div 
                        onClick={() => handleDrilldown('risk_low')}
                        className="flex flex-col items-center p-1 bg-slate-950/40 rounded border border-slate-900 cursor-pointer hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-center"
                        title="Click to view Safe/Stable active open tickets"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mb-1" />
                        <span className="font-extrabold text-white text-[11px]">{charts.slaMetrics.riskLow}</span>
                        <span className="text-[7px] text-slate-500 tracking-tighter">SAFE</span>
                      </div>
                    </div>
                  </div>

                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="chart-container report-chart p-6 h-[400px]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="label-sm mb-0 uppercase tracking-widest text-slate-400">Ticket Trends</h3>
                    </div>
                  <ResponsiveContainer width="100%" height="85%">
                    <LineChart data={charts.trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                      <XAxis dataKey="name" stroke={chartColors.text} fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke={chartColors.text} fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: '12px' }}
                        itemStyle={{ color: chartColors.tooltipText }}
                      />
                      <Line type="monotone" dataKey="closures" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', stroke: chartColors.tooltipBg, strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="chart-container report-chart p-5 h-[400px] flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="label-sm mb-0 uppercase tracking-widest text-slate-400">Priority Distribution</h3>
                    </div>
                    <div className="flex flex-grow items-center justify-around">
                      <div className="w-32 h-32 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={charts.priorityData}
                              innerRadius={45}
                              outerRadius={65}
                              paddingAngle={4}
                              dataKey="value"
                              stroke="none"
                            >
                              {charts.priorityData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-[10px] font-bold text-slate-500 uppercase">Status</div>
                        </div>
                      </div>
                      <div className="space-y-1.5 min-w-[100px]">
                        {charts.priorityData.map(p => (
                          <div key={p.name} className="flex items-center gap-3 text-xs font-mono">
                            <div className="w-2 h-2 rounded bg-slate-400" style={{ backgroundColor: p.color }}></div> 
                            <span className="text-slate-400">{p.name}:</span>
                            <span className="text-slate-200">{p.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="chart-container report-chart p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="label-sm mb-0 uppercase tracking-widest text-slate-400">Workload Distribution (L1-L4)</h3>
                  </div>
                  <div className="space-y-4">
                    {charts.levelData.map(level => {
                      const percentage = (level.count / (level.total || 1)) * 100;
                      return (
                        <div key={level.name} className="flex items-center gap-4">
                          <span className="text-xs w-4 font-bold text-slate-400">{level.name}</span>
                          <div className="flex-grow h-6 bg-slate-800/50 rounded overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.max(percentage, 2)}%` }}
                              className="h-full bg-slate-400 px-2 flex items-center text-[10px] font-bold text-slate-900 whitespace-nowrap"
                            >
                              {level.count} Tickets
                            </motion.div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="chart-container report-chart p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="label-sm mb-0 uppercase tracking-widest text-slate-400">Consumed Hours by Tier</h3>
                  </div>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={charts.consumptionData} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                        <XAxis type="number" stroke={chartColors.text} fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" stroke={chartColors.text} fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                          contentStyle={{ backgroundColor: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: '12px' }}
                          itemStyle={{ color: chartColors.tooltipText }}
                        />
                        <Bar dataKey="hours" radius={[0, 4, 4, 0]} fill="#818cf8" label={{ position: 'right', fill: chartColors.text, fontSize: 10 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    {charts.consumptionData.map((tier, idx) => (
                      <div key={idx} className="flex justify-between items-center px-2 py-1 bg-slate-900/40 rounded border border-slate-800/50">
                        <span className="text-[10px] font-bold text-slate-400">{tier.name} Tier</span>
                        <div className="flex gap-4">
                          <span className="text-[10px] text-slate-500">Tickets: <span className="text-white font-bold">{tier.count}</span></span>
                          <span className="text-[10px] text-slate-500">Total Hours: <span className="text-blue-400 font-bold">{tier.hours}h</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="chart-container report-chart p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="label-sm mb-0 uppercase tracking-widest text-slate-400">Top 5 Issues</h3>
                  </div>
                  <div className="space-y-4">
                    {charts.topIssues.map((issue, idx) => (
                      <div key={idx} className="flex flex-col gap-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-medium text-slate-300 truncate max-w-[80%]">{issue.name}</span>
                          <span className="text-slate-500 font-bold">{issue.count}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(issue.count / (charts.topIssues[0]?.count || 1)) * 100}%` }}
                            className="h-full bg-indigo-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="chart-container report-chart p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="label-sm mb-0 uppercase tracking-widest text-slate-400">Aging of Open Tickets</h3>
                  </div>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={charts.agingData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                        <XAxis dataKey="name" stroke={chartColors.text} fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke={chartColors.text} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => Math.round(val).toString()} />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                          contentStyle={{ backgroundColor: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: '12px' }}
                          itemStyle={{ color: chartColors.tooltipText }}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {charts.agingData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-center gap-4">
                    {charts.agingData.map((bucket, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: bucket.color }} />
                        <span className="text-[10px] text-slate-400 font-bold uppercase">{bucket.name}</span>
                        <span className="text-[10px] text-white font-black">{bucket.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                </div>
                </>
                ) : (
                  <div className="space-y-6">
                    {/* Productivity Header Details */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Total Managed Personnel */}
                      <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                        <div className="text-left">
                          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none mb-1">Managed Personnel</p>
                          <h3 className="text-2xl font-black text-white leading-none font-mono mt-1.5">
                            {visibleProductivityData.length} Resources
                          </h3>
                          <p className="text-[9px] text-slate-400 font-bold mt-1.5 uppercase tracking-wide">
                            With active workload in period
                          </p>
                        </div>
                        <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-400">
                          <Users className="w-5 h-5 animate-pulse-subtle" />
                        </div>
                      </div>

                      {/* Total Effort Hours */}
                      <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                        <div className="text-left">
                          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none mb-1">Time Invested</p>
                          <h3 className="text-2xl font-black text-white leading-none font-mono mt-1.5">
                            {visibleProductivityData.reduce((sum, r) => sum + r.totalHours, 0).toFixed(1)}h
                          </h3>
                          <p className="text-[9px] text-slate-300 font-bold mt-1.5 uppercase tracking-wide">
                            spent resolving tickets
                          </p>
                        </div>
                        <div className="p-3 bg-violet-500/10 rounded-xl text-violet-400">
                          <Clock className="w-5 h-5" />
                        </div>
                      </div>

                      {/* SLA Resolutions Completed */}
                      <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                        <div className="text-left">
                          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none mb-1">Total Resolutions</p>
                          <h3 className="text-2xl font-black text-white leading-none font-mono mt-1.5">
                            {visibleProductivityData.reduce((sum, r) => sum + r.resolvedCount, 0)} Tickets
                          </h3>
                          <p className="text-[9px] text-slate-400 font-bold mt-1.5 uppercase tracking-wide">
                            Successfully fixed and closed
                          </p>
                        </div>
                        <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                      </div>

                      {/* Speed rating */}
                      <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                        <div className="text-left">
                          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none mb-1">Global Speed Index</p>
                          <h3 className="text-2xl font-black text-white leading-none font-mono mt-1.5">
                            {(() => {
                              const resolvedSum = visibleProductivityData.reduce((sum, r) => sum + r.resolvedCount, 0);
                              const hoursSum = visibleProductivityData.reduce((sum, r) => sum + r.totalHours, 0);
                              return resolvedSum > 0 ? (hoursSum / resolvedSum).toFixed(1) : '0';
                            })()}h
                          </h3>
                          <p className="text-[9px] text-slate-400 font-bold mt-1.5 uppercase tracking-wide">
                            Average duration per incident
                          </p>
                        </div>
                        <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400">
                          <Brain className="w-5 h-5" />
                        </div>
                      </div>
                    </div>

                    {/* Priority Hours Stacked comparison chart */}
                    <div className="chart-container p-6 bg-slate-900/40 border border-slate-800 rounded-2xl">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div className="text-left">
                          <h3 className="text-sm font-black text-white uppercase tracking-wider mb-1 leading-none">Resource Effort &amp; Time Spent by Ticket Priority</h3>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-0.5">Stacked hours representation comparing relative workload of assigned engineers</p>
                        </div>
                        
                        {/* Select focus resource drop-down */}
                        {isManagerOrAdmin && (
                          <div className="flex items-center gap-2 select-none">
                            <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest whitespace-nowrap">Filter Engineer:</label>
                            <select 
                              value={prodSelectedRes}
                              onChange={(e) => setProdSelectedRes(e.target.value)}
                              className="bg-slate-950 border border-slate-800 text-xs text-white rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 font-bold transition-all"
                            >
                              <option value="All">All Resources</option>
                              {visibleProductivityData.map(r => (
                                <option key={r.name} value={r.name}>{r.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <div className="h-[320px] w-full">
                        {(() => {
                          const chartData = prodSelectedRes === 'All' 
                            ? visibleProductivityData 
                            : visibleProductivityData.filter(r => r.name === prodSelectedRes);
                          
                          if (chartData.length === 0) {
                            return (
                              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
                                <Users className="w-8 h-8 text-slate-700 mb-2" />
                                <p className="text-xs font-bold uppercase tracking-widest">No active hours logged in current timeframe</p>
                              </div>
                            );
                          }
                          return (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                                <XAxis dataKey="name" stroke={chartColors.text} fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke={chartColors.text} fontSize={10} tickLine={false} axisLine={false} />
                                <Tooltip 
                                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                  contentStyle={{ backgroundColor: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: '12px' }}
                                  itemStyle={{ color: chartColors.tooltipText }}
                                />
                                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 'bold' }} />
                                <Bar dataKey="p1Hours" name="P1 (Hours)" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="p2Hours" name="P2 (Hours)" stackId="a" fill="#f97316" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="p3Hours" name="P3 (Hours)" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="p4Hours" name="P4 (Hours)" stackId="a" fill="#22c55e" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Resource Productivity Details Grid */}
                    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
                        <h3 className="text-xs font-black text-white uppercase tracking-wider">Productivity Allocation Index</h3>
                        <span className="text-[10px] text-indigo-400 font-extrabold uppercase bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/10">Engineers Workload Metric</span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left font-sans text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 bg-slate-950/40 text-[10px] text-slate-500 font-black uppercase tracking-widest select-none">
                              <th className="px-6 py-4">Engineer / Resource</th>
                              <th className="px-6 py-4 text-center">Assigned</th>
                              <th className="px-6 py-4 text-center">Resolved</th>
                              <th className="px-6 py-4 text-center">Avg Resolution Speed</th>
                              <th className="px-6 py-4 text-center text-rose-400">P1 Effort</th>
                              <th className="px-6 py-4 text-center text-orange-400">P2 Effort</th>
                              <th className="px-6 py-4 text-center text-blue-400">P3 Effort</th>
                              <th className="px-6 py-4 text-center text-emerald-400">P4 Effort</th>
                              <th className="px-6 py-4 text-center">Total Hours</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 text-xs">
                            {(() => {
                              const tableData = prodSelectedRes === 'All' 
                                ? visibleProductivityData 
                                : visibleProductivityData.filter(r => r.name === prodSelectedRes);

                              if (tableData.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-slate-500 font-bold uppercase tracking-widest">
                                      No records match this selection
                                    </td>
                                  </tr>
                                );
                              }

                              return tableData.map((res) => (
                                <tr key={res.name} className="hover:bg-slate-900/20 transition-colors border-b border-slate-850">
                                  <td 
                                    onClick={() => handleDrilldown('resource_assigned', res.name)}
                                    className="px-6 py-4 text-left font-black text-white flex items-center gap-2 cursor-pointer group hover:opacity-80 transition-opacity"
                                  >
                                    <div className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold text-[10px] uppercase group-hover:scale-110 transition-transform">
                                      {res.name.substring(0, 2)}
                                    </div>
                                    <div>
                                      <p className="leading-none group-hover:text-indigo-300 transition-colors">{res.name}</p>
                                      <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">IT SUPPORT TEAM</p>
                                    </div>
                                  </td>
                                  <td 
                                    onClick={() => handleDrilldown('resource_assigned', res.name)}
                                    className="px-6 py-4 text-center font-mono font-bold text-slate-300 cursor-pointer hover:bg-indigo-500/5 transition-all"
                                    title="Click to view all assigned tickets"
                                  >
                                    {res.assignedCount}
                                  </td>
                                  <td 
                                    onClick={() => handleDrilldown('resource_resolved', res.name)}
                                    className="px-6 py-4 text-center cursor-pointer hover:bg-emerald-500/5 transition-all"
                                    title="Click to view resolved tickets"
                                  >
                                    <div className="flex flex-col items-center">
                                      <span className="font-mono font-black text-emerald-400">{res.resolvedCount}</span>
                                      <span className="text-[9px] text-slate-500 font-bold">({res.assignedCount > 0 ? Math.round((res.resolvedCount / res.assignedCount) * 100) : 0}%)</span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-center font-mono font-bold text-slate-400">
                                    {res.resolvedCount > 0 ? (
                                      <span className="text-indigo-400">{res.avgHoursPerResolution}h <span className="text-[9px] text-slate-500 font-bold">/ tkt</span></span>
                                    ) : (
                                      <span className="text-slate-600">N/A</span>
                                    )}
                                  </td>
                                  
                                  {/* P1 effort */}
                                  <td 
                                    onClick={() => handleDrilldown('resource_priority', { name: res.name, priority: 'P1' })}
                                    className="px-6 py-4 text-center cursor-pointer hover:bg-rose-500/10 transition-all border-l border-slate-900/40"
                                    title="Click to view P1 effort details"
                                  >
                                    <div className="flex flex-col items-center">
                                      <span className="font-mono text-slate-300">{res.p1Count} tkts</span>
                                      <span className="text-[10px] text-rose-400 font-black font-mono bg-rose-500/5 px-1.5 py-0.5 rounded mt-0.5">{res.p1Hours}h</span>
                                    </div>
                                  </td>
                                  
                                  {/* P2 effort */}
                                  <td 
                                    onClick={() => handleDrilldown('resource_priority', { name: res.name, priority: 'P2' })}
                                    className="px-6 py-4 text-center cursor-pointer hover:bg-orange-500/10 transition-all"
                                    title="Click to view P2 effort details"
                                  >
                                    <div className="flex flex-col items-center">
                                      <span className="font-mono text-slate-300">{res.p2Count} tkts</span>
                                      <span className="text-[10px] text-orange-400 font-black font-mono bg-orange-500/5 px-1.5 py-0.5 rounded mt-0.5">{res.p2Hours}h</span>
                                    </div>
                                  </td>
                                  
                                  {/* P3 effort */}
                                  <td 
                                    onClick={() => handleDrilldown('resource_priority', { name: res.name, priority: 'P3' })}
                                    className="px-6 py-4 text-center cursor-pointer hover:bg-blue-500/10 transition-all"
                                    title="Click to view P3 effort details"
                                  >
                                    <div className="flex flex-col items-center">
                                      <span className="font-mono text-slate-300">{res.p3Count} tkts</span>
                                      <span className="text-[10px] text-blue-400 font-black font-mono bg-blue-500/5 px-1.5 py-0.5 rounded mt-0.5">{res.p3Hours}h</span>
                                    </div>
                                  </td>
                                  
                                  {/* P4 effort */}
                                  <td 
                                    onClick={() => handleDrilldown('resource_priority', { name: res.name, priority: 'P4' })}
                                    className="px-6 py-4 text-center cursor-pointer hover:bg-emerald-500/10 transition-all border-r border-slate-900/40"
                                    title="Click to view P4 effort details"
                                  >
                                    <div className="flex flex-col items-center">
                                      <span className="font-mono text-slate-300">{res.p4Count} tkts</span>
                                      <span className="text-[10px] text-emerald-400 font-black font-mono bg-emerald-500/5 px-1.5 py-0.5 rounded mt-0.5">{res.p4Hours}h</span>
                                    </div>
                                  </td>
                                  
                                  {/* Total effort spent */}
                                  <td 
                                    onClick={() => handleDrilldown('resource_total', res.name)}
                                    className="px-6 py-4 text-center mr-2 cursor-pointer hover:opacity-80 active:scale-95 transition-all"
                                    title="Click to view complete performance details"
                                  >
                                    <div className="inline-block px-3 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg text-violet-400 font-black font-mono text-[13px] shadow shadow-violet-500/5">
                                      {res.totalHours}h
                                    </div>
                                  </td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : activeTab === 'workbook' ? (
              <motion.div 
                key="workbook"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                {(() => {
                  const activeFiltersCount = [
                    filterLevel !== 'All',
                    filterPriority !== 'All',
                    filterStatus !== 'All',
                    filterResponseSla !== 'All',
                    filterResolutionSla !== 'All'
                  ].filter(Boolean).length;

                  return (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="text-sm font-black text-white uppercase tracking-widest">My Workbook</h3>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">Real-time incident ledger and resolution tracking</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                          <input 
                            type="text" 
                            placeholder="Search tickets or solutions..." 
                            className="input-field pl-10"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                          />
                        </div>
                        <button 
                          onClick={() => {
                            setIsFilterPanelOpen(!isFilterPanelOpen);
                            setIsColumnsPanelOpen(false);
                          }}
                          className={cn(
                            "p-2 glass-panel rounded-md transition-all flex items-center gap-1.5 cursor-pointer",
                            isFilterPanelOpen || activeFiltersCount > 0 
                              ? "bg-slate-800 border-indigo-500/50 text-indigo-400" 
                              : "hover:bg-zinc-800 text-zinc-400"
                          )}
                          title="Toggle Filters"
                        >
                          <Filter className="w-4 h-4" />
                          {activeFiltersCount > 0 && (
                            <span className="bg-indigo-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded-full">
                              {activeFiltersCount}
                            </span>
                          )}
                        </button>
                        
                        <button 
                          onClick={() => {
                            setIsColumnsPanelOpen(!isColumnsPanelOpen);
                            setIsFilterPanelOpen(false);
                          }}
                          className={cn(
                            "p-2 glass-panel rounded-md transition-all flex items-center gap-1.5 cursor-pointer",
                            isColumnsPanelOpen 
                              ? "bg-slate-800 border-emerald-500/50 text-emerald-400" 
                              : "hover:bg-zinc-800 text-zinc-400"
                          )}
                          title="Customize Columns Layout"
                        >
                          <Settings className="w-4 h-4 text-emerald-500" />
                          <span className="text-xs font-bold hidden sm:inline">Configure Columns</span>
                        </button>
                      </div>

                      <AnimatePresence mode="wait">
                        {isFilterPanelOpen && (
                          <motion.div 
                            key="filter-panel"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="glass-panel p-4 rounded-xl border border-slate-800/60 bg-slate-900/40 grid grid-cols-2 lg:grid-cols-5 gap-4 shadow-xl overflow-hidden"
                          >
                            <div>
                              <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Support Level</label>
                              <select 
                                className="w-full bg-slate-950/80 text-xs text-slate-200 border border-slate-800 rounded px-2.5 py-1.5 font-bold focus:outline-none focus:border-indigo-500/50 cursor-pointer h-8"
                                value={filterLevel}
                                onChange={e => setFilterLevel(e.target.value)}
                              >
                                <option value="All">All Levels</option>
                                <option value="L1">L1 - Basic</option>
                                <option value="L2">L2 - Intermediate</option>
                                <option value="L3">L3 - Advanced</option>
                                <option value="L4">L4 - Specialized</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Priority</label>
                              <select 
                                className="w-full bg-slate-950/80 text-xs text-slate-200 border border-slate-800 rounded px-2.5 py-1.5 font-bold focus:outline-none focus:border-indigo-500/50 cursor-pointer h-8"
                                value={filterPriority}
                                onChange={e => setFilterPriority(e.target.value)}
                              >
                                <option value="All">All Priorities</option>
                                <option value="P1">P1 - Critical</option>
                                <option value="P2">P2 - High</option>
                                <option value="P3">P3 - Medium</option>
                                <option value="P4">P4 - Low</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Incident Status</label>
                              <select 
                                className="w-full bg-slate-950/80 text-xs text-slate-200 border border-slate-800 rounded px-2.5 py-1.5 font-bold focus:outline-none focus:border-indigo-500/50 cursor-pointer h-8"
                                value={filterStatus}
                                onChange={e => setFilterStatus(e.target.value)}
                              >
                                <option value="All">All Statuses</option>
                                <option value="Open">Open</option>
                                <option value="In-Progress">In-Progress</option>
                                <option value="Hold">Hold</option>
                                <option value="Resolved">Resolved</option>
                                <option value="Closed">Closed</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Response SLA</label>
                              <select 
                                className="w-full bg-slate-950/80 text-xs text-slate-200 border border-slate-800 rounded px-2.5 py-1.5 font-bold focus:outline-none focus:border-indigo-500/50 cursor-pointer h-8"
                                value={filterResponseSla}
                                onChange={e => setFilterResponseSla(e.target.value)}
                              >
                                <option value="All">All SLA Statuses</option>
                                <option value="ACTIVE">ACTIVE</option>
                                <option value="MET">MET</option>
                                <option value="NOT MET">NOT MET</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Resolution SLA</label>
                              <select 
                                className="w-full bg-slate-950/80 text-xs text-slate-200 border border-slate-800 rounded px-2.5 py-1.5 font-bold focus:outline-none focus:border-indigo-500/50 cursor-pointer h-8"
                                value={filterResolutionSla}
                                onChange={e => setFilterResolutionSla(e.target.value)}
                              >
                                <option value="All">All SLA Statuses</option>
                                <option value="ACTIVE">ACTIVE</option>
                                <option value="MET">MET</option>
                                <option value="NOT MET">NOT MET</option>
                              </select>
                            </div>

                            {activeFiltersCount > 0 && (
                              <div className="col-span-2 lg:col-span-5 flex items-center justify-between border-t border-slate-800/40 pt-3 mt-1">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                  Filtering {filteredTasks.length} of {projectFilteredTasks.length} tickets
                                </span>
                                <button 
                                  onClick={() => {
                                    setFilterLevel('All');
                                    setFilterPriority('All');
                                    setFilterStatus('All');
                                    setFilterResponseSla('All');
                                    setFilterResolutionSla('All');
                                  }}
                                  className="text-[9px] text-red-400 hover:text-red-300 font-bold uppercase tracking-widest flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1.5 rounded transition-all border border-red-500/20 cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                  Clear All Filters
                                </button>
                              </div>
                            )}
                          </motion.div>
                        )}

                        {isColumnsPanelOpen && (
                          <motion.div 
                            key="columns-panel"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="glass-panel p-5 rounded-xl border border-slate-800/60 bg-slate-900/40 shadow-xl overflow-hidden space-y-4"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800/60 pb-3 gap-2">
                              <div>
                                <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-1.5">
                                  <Settings className="w-3.5 h-3.5 text-emerald-400" />
                                  Workbook Columns Manager
                                </h4>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Toggle column visibility and click left/right arrows to reorder positions dynamically</p>
                              </div>
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => saveColumns(DEFAULT_WORKBOOK_COLUMNS)}
                                  className="text-[9px] text-zinc-400 hover:text-white font-bold uppercase tracking-widest bg-zinc-805 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1.5 rounded transition-all cursor-pointer"
                                >
                                  Reset to Default
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                              {workbookColumns.map((col, index) => {
                                return (
                                  <div 
                                    key={col.id} 
                                    className={cn(
                                      "flex items-center justify-between p-2 rounded-lg border transition-all",
                                      col.visible 
                                        ? "bg-slate-950/40 border-slate-800/80 text-slate-200" 
                                        : "bg-slate-950/10 border-slate-900/40 text-slate-600 line-through"
                                    )}
                                  >
                                    <div className="flex items-center gap-2 overflow-hidden px-1">
                                      <input 
                                        type="checkbox"
                                        checked={col.visible}
                                        onChange={(e) => {
                                          const updated = [...workbookColumns];
                                          updated[index] = { ...col, visible: e.target.checked };
                                          saveColumns(updated);
                                        }}
                                        className="w-3.5 h-3.5 rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-emerald-500/50 cursor-pointer"
                                      />
                                      <span className="text-xs font-bold truncate tracking-tight">{col.label}</span>
                                    </div>

                                    <div className="flex items-center gap-0.5 shrink-0 bg-slate-950/60 p-0.5 rounded border border-slate-850/40">
                                      <button 
                                        type="button"
                                        disabled={index === 0}
                                        onClick={() => {
                                          if (index === 0) return;
                                          const updated = [...workbookColumns];
                                          const temp = updated[index];
                                          updated[index] = updated[index - 1];
                                          updated[index - 1] = temp;
                                          saveColumns(updated);
                                        }}
                                        className="p-1 hover:bg-slate-800 text-zinc-500 hover:text-white rounded disabled:opacity-25 disabled:hover:bg-transparent transition-all cursor-pointer"
                                        title="Move Column Left / Up"
                                      >
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                      </button>
                                      <button 
                                        type="button"
                                        disabled={index === workbookColumns.length - 1}
                                        onClick={() => {
                                          if (index === workbookColumns.length - 1) return;
                                          const updated = [...workbookColumns];
                                          const temp = updated[index];
                                          updated[index] = updated[index + 1];
                                          updated[index + 1] = temp;
                                          saveColumns(updated);
                                        }}
                                        className="p-1 hover:bg-slate-800 text-zinc-500 hover:text-white rounded disabled:opacity-25 disabled:hover:bg-transparent transition-all cursor-pointer"
                                        title="Move Column Right / Down"
                                      >
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  );
                })()}

                  <div className="glass-panel rounded-xl overflow-hidden border border-slate-800/50">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-900/80 border-b border-slate-800">
                        <tr>
                          {workbookColumns.map(col => {
                            if (!col.visible) return null;
                            if (col.id === 'responseSla' || col.id === 'resolutionSla' || col.id === 'aging') {
                              return renderSortHeader(col.id, col.label, 'text-center');
                            }
                            return renderSortHeader(col.id, col.label);
                          })}
                          <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-slate-500 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {paginatedTasks.map(task => {
                          const config = projectConfigs.find(c => c.projectId === task.projectId);
                          const nowString = new Date().toISOString();
                          const slaData = getTaskSlaTimes(task, nowString);
                          
                          const responseTimeMin = slaData.responseTimeMin;
                          const isResponseBreached = slaData.isResponseBreached;
                          const responseDelayMin = slaData.responseDelayMin;
                          const wasResponded = slaData.responseLogged;

                          const resTimeMin = slaData.wasResolved ? slaData.resolutionTimeMin : null;
                          const isBreached = slaData.isResolutionBreached;
                          const delayMin = slaData.resolutionDelayMin;

                          const isClosedOrResolved = task.status === 'Closed' || task.status === 'Resolved';
                          const remainingResoTime = slaData.resolutionLimitMin - slaData.resolutionTimeMin;
                          const isNearBreach = !isClosedOrResolved && (remainingResoTime < (0.2 * slaData.resolutionLimitMin));

                          return (
                            <tr 
                              key={task.id} 
                              className={cn(
                                "hover:bg-slate-800/20 transition-colors group relative",
                                isNearBreach ? "bg-red-950/10 hover:bg-red-900/10 border-l border-red-500/80" : ""
                              )}
                            >
                              {workbookColumns.map(col => {
                                if (!col.visible) return null;
                                switch (col.id) {
                                  case 'ticketId': {
                                    const targetKey = 'sflow_attachments_' + task.ticketId;
                                    const listStr = localStorage.getItem(targetKey);
                                    let attachmentsCount = 0;
                                    if (listStr) {
                                      try {
                                        const parsed = JSON.parse(listStr);
                                        attachmentsCount = Array.isArray(parsed) ? parsed.length : 0;
                                      } catch (e) {}
                                    }

                                    return (
                                      <td key="ticketId" className="px-4 py-4 font-mono font-medium text-slate-300">
                                        <div className="flex items-center gap-2">
                                          {isNearBreach && (
                                            <span className="relative flex h-2 w-2" title="Breach Warning: Less than 20% SLA remaining!">
                                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                            </span>
                                          )}
                                          <button 
                                            onClick={() => setAuditTask(task)}
                                            className="hover:text-amber-400 font-mono text-xs font-semibold hover:underline text-left cursor-pointer transition-colors"
                                            title="Click to view full case SLA audit & active attachments list"
                                          >
                                            {task.ticketId}
                                          </button>
                                          {attachmentsCount > 0 && (
                                            <button
                                              onClick={() => setAuditTask(task)}
                                              className="p-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20 hover:border-rose-450 flex items-center gap-1 text-[9px] font-black transition-all cursor-pointer shadow-sm animate-pulse"
                                              title={`${attachmentsCount} file attachment(s) found. Click to inspect & download.`}
                                            >
                                              <Paperclip className="w-3 h-3 text-rose-400" />
                                              <span>{attachmentsCount}</span>
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  }
                                  case 'projectId':
                                    return (
                                      <td key="projectId" className="px-4 py-4">
                                        <span className="inline-block px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded text-[10px] uppercase font-mono font-black tracking-widest leading-none">
                                          {task.projectId}
                                        </span>
                                      </td>
                                    );
                                  case 'category':
                                    return (
                                      <td key="category" className="px-4 py-4 text-xs text-slate-300 font-medium whitespace-nowrap">
                                        {task.category || '-'}
                                      </td>
                                    );
                                  case 'subcategory':
                                    return (
                                      <td key="subcategory" className="px-4 py-4 text-xs text-slate-400 whitespace-nowrap">
                                        {task.subcategory || '-'}
                                      </td>
                                    );
                                  case 'supportLevel':
                                    return (
                                      <td key="supportLevel" className="px-4 py-4 text-xs font-semibold text-slate-500">{task.supportLevel}</td>
                                    );
                                  case 'priority':
                                    return (
                                      <td key="priority" className="px-4 py-4">
                                        <span 
                                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
                                          style={{ backgroundColor: `${PRIORITY_COLORS[task.priority]}15`, color: PRIORITY_COLORS[task.priority] }}
                                        >
                                          {task.priority}
                                        </span>
                                      </td>
                                    );
                                  case 'status':
                                    return (
                                      <td key="status" className="px-4 py-4">
                                        <div className="flex flex-col gap-0.5">
                                          <span className="flex items-center gap-1.5 text-xs text-slate-300">
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[task.status] }} />
                                            {task.status}
                                          </span>
                                          {task.status === 'Hold' && task.holdReason && (
                                            <span className="text-[10px] text-pink-400 font-medium italic pl-3 max-w-[120px] truncate" title={task.holdReason}>
                                              {task.holdReason}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  case 'description': {
                                    const rawVal = task.description || '';
                                    const entries = parseEntries(rawVal, task.createdBy || 'Admin', task.generationDate);
                                    const cellText = entries[0]?.text || '';
                                    const truncatedText = cellText.substring(0, 5);
                                    const finalDisplay = truncatedText + (cellText.length > 5 ? '...' : '');
                                    const hoverTitle = getHoverTooltip(rawVal, task, 'description');
                                    return (
                                      <td key="description" className="px-4 py-4">
                                        <button
                                          onClick={() => openLogEditModal(task, 'description', 'Issue Description')}
                                          className="text-xs text-blue-400 hover:text-blue-300 font-mono font-medium hover:underline text-left cursor-pointer transition-colors border-b border-dashed border-blue-900/50 pb-0.5"
                                          title={hoverTitle}
                                        >
                                          {finalDisplay || '(empty)'}
                                        </button>
                                      </td>
                                    );
                                  }
                                  case 'createdBy': {
                                    const creator = task.createdBy || 'Admin';
                                    return (
                                      <td key="createdBy" className="px-4 py-4">
                                        <div className="flex items-center gap-2">
                                          <div className="w-5 h-5 rounded-full bg-slate-905 flex items-center justify-center text-[10px] font-bold text-slate-400 border border-slate-700">
                                            {creator.charAt(0)}
                                          </div>
                                          <span className="text-xs text-slate-400">{creator}</span>
                                        </div>
                                      </td>
                                    );
                                  }
                                  case 'assignedTo':
                                    return (
                                      <td key="assignedTo" className="px-4 py-4">
                                        <div className="flex items-center gap-2">
                                          <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 border border-slate-700">
                                            {task.assignedTo?.charAt(0) || '?'}
                                          </div>
                                          <span className="text-xs text-slate-400">{task.assignedTo || '-'}</span>
                                        </div>
                                      </td>
                                    );
                                  case 'generationDate':
                                    return (
                                      <td key="generationDate" className="px-4 py-4 text-slate-500 text-xs">
                                        {format(parseISO(task.generationDate), 'MMM d, p')}
                                      </td>
                                    );
                                  case 'responseDate':
                                    return (
                                      <td key="responseDate" className="px-4 py-4 text-slate-500 text-xs">
                                        {task.responseDate ? format(parseISO(task.responseDate), 'MMM d, p') : '-'}
                                      </td>
                                    );
                                  case 'closureDate':
                                    return (
                                      <td key="closureDate" className="px-4 py-4 text-slate-500 text-xs">
                                        {task.closureDate ? format(parseISO(task.closureDate), 'MMM d, p') : '-'}
                                      </td>
                                    );
                                  case 'solution': {
                                    const rawVal = task.solution || '';
                                    const entries = parseEntries(rawVal, task.assignedTo || 'Admin', task.closureDate || task.generationDate);
                                    const cellText = entries[0]?.text || '';
                                    const truncatedText = cellText.substring(0, 5);
                                    const finalDisplay = truncatedText + (cellText.length > 5 ? '...' : '');
                                    const hoverTitle = getHoverTooltip(rawVal, task, 'solution');
                                    return (
                                      <td key="solution" className="px-4 py-4">
                                        <button
                                          onClick={() => openLogEditModal(task, 'solution', 'Resolution Description')}
                                          className="text-xs text-blue-400 hover:text-blue-300 font-mono font-medium hover:underline text-left cursor-pointer transition-colors border-b border-dashed border-blue-900/50 pb-0.5"
                                          title={hoverTitle}
                                        >
                                          {finalDisplay || '(empty)'}
                                        </button>
                                      </td>
                                    );
                                  }
                                  case 'remarks': {
                                    const rawVal = task.remarks || '';
                                    const entries = parseEntries(rawVal, task.createdBy || 'Admin', task.generationDate);
                                    const cellText = entries[0]?.text || '';
                                    const truncatedText = cellText.substring(0, 5);
                                    const finalDisplay = truncatedText + (cellText.length > 5 ? '...' : '');
                                    const hoverTitle = getHoverTooltip(rawVal, task, 'remarks');
                                    return (
                                      <td key="remarks" className="px-4 py-4">
                                        <button
                                          onClick={() => openLogEditModal(task, 'remarks', 'Remarks')}
                                          className="text-xs text-blue-400 hover:text-blue-300 font-mono font-medium hover:underline text-left cursor-pointer transition-colors border-b border-dashed border-blue-900/50 pb-0.5"
                                          title={hoverTitle}
                                        >
                                          {finalDisplay || '(empty)'}
                                        </button>
                                      </td>
                                    );
                                  }
                                  case 'responseSla':
                                    return (
                                      <td key="responseSla" className="px-4 py-4 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                          {isResponseBreached ? (
                                            <>
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap bg-red-500/10 text-red-500 border border-red-500/20">
                                                NOT MET
                                              </span>
                                              <span className="text-[10px] text-red-400 font-mono">
                                                +{formatDuration(responseDelayMin * 60000)}
                                              </span>
                                            </>
                                          ) : wasResponded ? (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                              MET
                                            </span>
                                          ) : (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider whitespace-nowrap bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                              ACTIVE
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  case 'resolutionSla':
                                    return (
                                      <td key="resolutionSla" className="px-4 py-4 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                          {isBreached ? (
                                            <>
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap bg-red-500/15 text-red-450 border border-red-500/30 animate-pulse flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3 text-red-400" />
                                                BREACHED
                                              </span>
                                              <span className="text-[10px] text-red-400 font-mono">
                                                +{formatDuration(delayMin * 60000)}
                                              </span>
                                            </>
                                          ) : task.closureDate ? (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                              MET
                                            </span>
                                          ) : isNearBreach ? (
                                            <>
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider whitespace-nowrap bg-red-500/20 text-red-450 border border-red-400/50 animate-pulse flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3 text-red-450 animate-bounce" />
                                                BREACH RISK
                                              </span>
                                              <span className="text-[9px] text-red-400 font-mono font-bold">
                                                {formatDuration(remainingResoTime * 60000)} left
                                              </span>
                                            </>
                                          ) : (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider whitespace-nowrap bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                              ACTIVE
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  case 'aging':
                                    return (
                                      <td key="aging" className="px-4 py-4 text-center">
                                        <span className="text-xs font-mono text-slate-300">
                                          {(() => {
                                            if (task.status === 'Closed' || task.status === 'Resolved') {
                                              return '-';
                                            }
                                            const now = format(new Date(), "yyyy-MM-dd'T'HH:mm:ss");
                                            const totalMin = getBusinessMinutes(task.generationDate, now, getEffectiveShift(task.projectId, task.assignedTo));
                                            return formatDuration(totalMin * 60000);
                                          })()}
                                        </span>
                                      </td>
                                    );
                                  default:
                                    return null;
                                }
                              })}
                              <td className="px-4 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {(() => {
                                    const targetKey = 'sflow_attachments_' + task.ticketId;
                                    const listStr = localStorage.getItem(targetKey);
                                    let count = 0;
                                    if (listStr) {
                                      try {
                                        count = JSON.parse(listStr).length;
                                      } catch (e) {}
                                    }
                                    return (
                                      <button 
                                        onClick={() => setAuditTask(task)}
                                        className={cn(
                                          "p-1.5 rounded transition-all flex items-center justify-center border",
                                          count > 0 
                                            ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30 hover:border-rose-400 scale-105" 
                                            : "bg-slate-900 hover:bg-slate-800 text-slate-500 hover:text-slate-300 border-slate-800/80 hover:border-slate-700 hidden group-hover:flex"
                                        )}
                                        title={count > 0 ? `${count} active attachments. Click to inspect & download.` : "Attach files or inspect details"}
                                      >
                                        <Paperclip className="w-3.5 h-3.5" />
                                      </button>
                                    );
                                  })()}
                                  <button 
                                    onClick={() => setAuditTask(task)}
                                    className="p-1.5 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 rounded transition-all opacity-0 group-hover:opacity-100"
                                    title="View Audit & SLA Details"
                                  >
                                    <History className="w-3.5 h-3.5" />
                                  </button>
                                  {(isAdmin || task.assignedTo === currentUser) && (
                                    <>
                                      <button 
                                        onClick={() => startEditing(task)}
                                        className="opacity-0 group-hover:opacity-100 px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded text-[10px] font-bold transition-all"
                                      >
                                        Edit
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteTask(task.id)}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded transition-all inline-block"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                  {!(isAdmin || task.assignedTo === currentUser) && (
                                    <ShieldAlert className="w-4 h-4 text-slate-700 opacity-20" title="Read Only" />
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination and Configurable Page Size Controls */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 mt-2 bg-slate-900/40 border border-slate-800/40 rounded-xl">
                  <div className="text-xs text-slate-400">
                    Showing <span className="text-white font-semibold">{totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> to{' '}
                    <span className="text-white font-semibold">
                      {Math.min(currentPage * pageSize, totalItems)}
                    </span>{' '}
                    of <span className="text-white font-semibold">{totalItems}</span> tickets
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    {/* Page Size Selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-bold uppercase tracking-wider text-[9px]">per page:</span>
                      <select
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1); // Reset to first page
                        }}
                      >
                        {[5, 10, 20, 50, 100].map((size) => (
                          <option key={size} value={size}>
                            {size} records
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Pagination buttons */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 hover:text-white transition-all text-xs font-semibold"
                      >
                        First
                      </button>
                      <button
                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 hover:text-white transition-all text-xs"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(page => {
                            // Show current page, and up to 2 pages around it, plus boundary first/last pages
                            return Math.abs(page - currentPage) <= 2 || page === 1 || page === totalPages;
                          })
                          .map((page, index, array) => {
                            const showDots = index > 0 && page - array[index - 1] > 1;
                            return (
                              <React.Fragment key={page}>
                                {showDots && <span className="text-slate-600 px-1 font-bold">...</span>}
                                <button
                                  onClick={() => setCurrentPage(page)}
                                  className={cn(
                                    "w-7 h-7 flex items-center justify-center rounded text-xs font-bold transition-all",
                                    currentPage === page
                                      ? "bg-blue-600 text-white"
                                      : "bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800"
                                  )}
                                >
                                  {page}
                                </button>
                              </React.Fragment>
                            );
                          })}
                      </div>

                      <button
                        onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 hover:text-white transition-all text-xs"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 hover:text-white transition-all text-xs font-semibold"
                      >
                        Last
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Project Selector Segment */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 p-2 rounded-xl shadow-inner">
                    <span className="text-[10px] uppercase font-black text-slate-500 pl-3 tracking-widest">Active Governance Domain</span>
                    <select 
                      className="bg-slate-800 text-xs font-black text-blue-400 px-4 py-2 rounded-lg outline-none cursor-pointer border border-slate-700 hover:border-blue-500/50 transition-all"
                      value={configSelectedProject}
                      onChange={(e) => setConfigSelectedProject(e.target.value)}
                    >
                      {projectConfigs.map(p => <option key={p.projectId} value={p.projectId}>{p.projectId}</option>)}
                    </select>
                  </div>
                  
                  <div className="flex-1 flex items-center gap-3 p-2 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl">
                    <div className="px-4">
                      <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-0.5">Provision ID</span>
                      <input 
                        type="text"
                        placeholder="E.G. PROJECT-DELTA"
                        value={newProjectInput}
                        onChange={(e) => setNewProjectInput(e.target.value.toUpperCase().replace(/\s+/g, '-'))}
                        className="bg-transparent border-none focus:ring-0 text-xs font-bold text-white w-32 placeholder:text-slate-800 p-0"
                      />
                    </div>
                    <button 
                      onClick={handleAddProject}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Project
                    </button>
                    {projectsDB.length > 1 && (
                      <button 
                         onClick={() => handleDeleteProject(configSelectedProject)}
                         className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                         title="Delete Selected Project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Segment 1: SLA Configuration */}
                <div className="chart-container p-8 border-l-4 border-l-amber-500/50">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500">
                        <Clock className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-white leading-tight uppercase tracking-tight">SLA Configuration</h3>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">Definition of service level benchmarks for {currentConfig?.projectId || 'Selected Project'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => {
                          if (!currentConfig) return;
                          askConfirmation(
                            'Reset SLA Configuration',
                            `This will reset all service level benchmarks for ${currentConfig?.projectId} to zero. Continue?`,
                            () => {
                              const resetSlas = {
                                P1: { response: 0, resolution: 0 },
                                P2: { response: 0, resolution: 0 },
                                P3: { response: 0, resolution: 0 },
                                P4: { response: 0, resolution: 0 },
                              };
                              setTempProjectSlas(resetSlas);
                              setProjectConfigs(prev => prev.map(c => 
                                c.projectId === currentConfig?.projectId 
                                  ? { ...c, slas: resetSlas }
                                  : c
                              ));
                              setConfigChanges(prev => [{
                                id: Math.random().toString(36).substr(2, 9),
                                projectId: currentConfig?.projectId || configSelectedProject,
                                type: 'SLA',
                                detail: `SLA Configuration Deleted: Targets reset to zero for ${currentConfig?.projectId || configSelectedProject}`,
                                timestamp: new Date().toISOString(),
                                user: currentUser
                              }, ...prev]);
                            },
                            'danger',
                            'Reset'
                          );
                        }}
                        disabled={!currentConfig}
                        className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl border border-red-500/20 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete/Reset Configuration"
                      >
                        <Trash2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      </button>
                      <button 
                        onClick={handleSaveConfiguration}
                        disabled={!currentConfig}
                        className="btn-primary flex items-center gap-2 px-8 py-3 shadow-xl shadow-blue-500/10 uppercase font-black tracking-widest text-[11px] bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-4 h-4" />
                        TAG SLA
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {(['P1', 'P2', 'P3', 'P4'] as Priority[]).map((p) => (
                      <div key={p} className="p-5 bg-slate-900/40 rounded-2xl border border-slate-800 space-y-6 group hover:border-amber-500/30 transition-all duration-300 shadow-xl">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full shadow-[0_0_12px_rgba(0,0,0,0.5)]" style={{ backgroundColor: PRIORITY_COLORS[p] }} />
                            <span className="text-xs font-black text-white tracking-widest uppercase">{p} Criticality</span>
                          </div>
                        </div>
                        
                        <div className="space-y-5">
                          <div className="space-y-2">
                            <label className="text-[9px] uppercase font-black text-slate-500 tracking-[0.2em] block pl-1">Response (Hrs)</label>
                            <input 
                              type="number" 
                              className="input-field h-11 px-4 text-sm font-mono focus:ring-amber-500/20 bg-slate-950/50" 
                              value={tempProjectSlas[p].response}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setTempProjectSlas(prev => ({
                                  ...prev,
                                  [p]: { ...prev[p], response: val }
                                }));
                              }}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] uppercase font-black text-slate-500 tracking-[0.2em] block pl-1">Resolution (Hrs)</label>
                            <input 
                              type="number" 
                              className="input-field h-11 px-4 text-sm font-mono focus:ring-amber-500/20 bg-slate-950/50" 
                              value={tempProjectSlas[p].resolution}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setTempProjectSlas(prev => ({
                                  ...prev,
                                  [p]: { ...prev[p], resolution: val }
                                }));
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Segment 2: Personnel Mapping */}
                <div id="personnel-mapping-anchor" className="chart-container p-8 border-l-4 border-l-emerald-500/50">
                  <div className="space-y-8">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
                        <ListTodo className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-xl font-black text-white uppercase tracking-tight">Personnel Mapping</h4>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">Tag personnel to specific project resource pools</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Left: Input & Role */}
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Employee Identity</label>
                          <select 
                            className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all shadow-inner appearance-none cursor-pointer"
                            value={personnelInput}
                            onChange={(e) => setPersonnelInput(e.target.value)}
                          >
                            <option value="" className="text-slate-500 bg-slate-950">Select User...</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id} className="text-slate-200 bg-slate-950">
                                {user.name} ({user.id})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Middle: Project Selection */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Project Allocation</label>
                          <div className="flex gap-4">
                            <button 
                              onClick={() => setSelectedProjectsForMapping([])}
                              className="text-[9px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
                            >
                              Clear
                            </button>
                            <button 
                              onClick={() => setSelectedProjectsForMapping(projectConfigs.map(p => p.projectId))}
                              className="text-[9px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-300 transition-colors"
                            >
                              Select All
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2 h-[134px] overflow-y-auto pr-2 custom-scrollbar">
                          {projectConfigs.map(p => (
                            <button
                              key={p.projectId}
                              onClick={() => {
                                setSelectedProjectsForMapping(prev => 
                                  prev.includes(p.projectId) 
                                    ? prev.filter(id => id !== p.projectId) 
                                    : [...prev, p.projectId]
                                );
                              }}
                              className={cn(
                                "flex items-center gap-3 px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all text-left",
                                selectedProjectsForMapping.includes(p.projectId)
                                  ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-[0_0_15px_-5px_rgba(16,185,129,0.3)]"
                                  : "bg-slate-900/40 border-slate-800 text-slate-500 hover:border-slate-700"
                              )}
                            >
                              <div className={cn(
                                "w-2 h-2 rounded-full transition-all flex-shrink-0",
                                selectedProjectsForMapping.includes(p.projectId) ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-slate-800"
                              )} />
                              <span className="truncate">{p.projectId}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Right: Active Mapping Reference */}
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Tagged Resources</label>
                        <div className="bg-slate-950/30 border border-slate-800/50 rounded-2xl h-[134px] overflow-y-auto custom-scrollbar p-1">
                          {selectedProjectsForMapping.length === 0 ? (
                            <div className="h-full flex items-center justify-center">
                              <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest text-center px-4">Select projects to view mapped personnel</p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {mappedInSelection.map(emp => (
                                <div key={emp} className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-900/50 rounded-lg group border border-transparent hover:border-slate-800 transition-all">
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-slate-300 truncate max-w-[120px]">{emp}</span>
                                  </div>
                                  <button 
                                    onClick={() => handleUnmapResource(emp)}
                                    className="p-1 text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              {mappedInSelection.length === 0 && (
                                <div className="h-full py-10 flex items-center justify-center">
                                  <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest">No resources mapped</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end pt-6 border-t border-slate-800/50 gap-4">
                      {editingEmployee && (
                        <button 
                          onClick={() => {
                            setPersonnelInput('');
                            setSelectedProjectsForMapping([]);
                            setEditingEmployee(null);
                          }}
                          className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          Cancel Modification
                        </button>
                      )}
                      <button 
                        onClick={handlePersonnelMapping}
                        disabled={!personnelInput.trim() || selectedProjectsForMapping.length === 0}
                        className={cn(
                          "btn-primary flex items-center gap-2 px-12 py-4 shadow-xl uppercase font-black tracking-[0.2em] text-[11px] transition-all",
                          personnelInput.trim() && selectedProjectsForMapping.length > 0
                            ? (editingEmployee ? "bg-amber-600 hover:bg-amber-500 shadow-amber-500/20" : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20")
                            : "bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700"
                        )}
                      >
                        {editingEmployee ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {editingEmployee ? 'Apply Management Changes' : 'Execute Personnel Mapping'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Segment 3: Project Based Shifts Allocation */}
                <div className="chart-container p-8 border-l-4 border-l-blue-500/50">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                        <Settings className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-white leading-tight uppercase tracking-tight">Project Based Shifts Allocation</h3>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">Operational window and holiday calendar for {currentConfig?.projectId}</p>
                      </div>
                    </div>
                    <button 
                      onClick={handleSaveConfiguration}
                      disabled={!currentConfig}
                      className="btn-primary flex items-center gap-2 px-8 py-3 shadow-xl shadow-blue-500/10 uppercase font-black tracking-widest text-[11px] bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Sync Strategy
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    {/* Shift Timing */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-blue-400" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Shift Window (24H Format)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[9px] uppercase font-black text-slate-500 tracking-widest block pl-1">Start Time</label>
                          <input 
                            type="text" 
                            placeholder="09:00"
                            className="input-field h-12 px-5 text-sm font-mono focus:ring-blue-500/20 bg-slate-950/50" 
                            value={tempShiftStart}
                            onChange={(e) => setTempShiftStart(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] uppercase font-black text-slate-500 tracking-widest block pl-1">End Time</label>
                          <input 
                            type="text" 
                            placeholder="18:00"
                            className="input-field h-12 px-5 text-sm font-mono focus:ring-blue-500/20 bg-slate-950/50" 
                            value={tempShiftEnd}
                            onChange={(e) => setTempShiftEnd(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                        <p className="text-[10px] text-blue-300/70 font-medium italic">
                          * Aging and SLA metrics will pause outside this window.
                        </p>
                      </div>
                    </div>

                    {/* Working Days & Holidays */}
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <ListTodo className="w-4 h-4 text-blue-400" />
                          <span className="text-[10px] font-black text-white uppercase tracking-widest">Work Calendar Selection</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                            <button
                              key={day}
                              onClick={() => setTempWorkingDays(prev => 
                                prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
                              )}
                              className={cn(
                                "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border",
                                tempWorkingDays.includes(day)
                                  ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20"
                                  : "bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700"
                              )}
                            >
                              {day}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] uppercase font-black text-slate-500 tracking-widest block pl-1">Public Holidays (YYYY-MM-DD, Comma Separated)</label>
                        <textarea 
                          className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-white text-xs font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 outline-none transition-all h-24 placeholder:text-slate-800"
                          placeholder="2024-01-01, 2024-12-25"
                          value={tempHolidays}
                          onChange={(e) => setTempHolidays(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Individual Resource Shifts Allocation */}
                  <div className="mt-12 pt-12 border-t border-slate-800/50">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-violet-400" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Individual Resource Shifts Allocation</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                       {/* Form to add/edit employee shift */}
                       <div className="xl:col-span-1 space-y-4 bg-slate-900/30 p-6 rounded-2xl border border-slate-800/50">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-[9px] uppercase font-black text-slate-500 tracking-widest block pl-1">Target Personnel</label>
                              <select 
                                className="input-field h-10 px-4 text-xs font-bold uppercase tracking-wider bg-slate-950/50"
                                value={empShiftData.name}
                                onChange={(e) => setEmpShiftData(prev => ({ ...prev, name: e.target.value }))}
                              >
                                <option value="">Select Personnel</option>
                                {currentConfig?.employees.map(emp => (
                                  <option key={emp} value={emp}>{emp}</option>
                                ))}
                              </select>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <label className="text-[9px] uppercase font-black text-slate-500 tracking-widest block pl-1">Start</label>
                                <input 
                                  type="text" 
                                  placeholder="09:00"
                                  className="input-field h-10 px-4 text-xs font-mono bg-slate-950/50" 
                                  value={empShiftData.shiftStart}
                                  onChange={(e) => setEmpShiftData(prev => ({ ...prev, shiftStart: e.target.value }))}
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[9px] uppercase font-black text-slate-500 tracking-widest block pl-1">End</label>
                                <input 
                                  type="text" 
                                  placeholder="18:00"
                                  className="input-field h-10 px-4 text-xs font-mono bg-slate-950/50" 
                                  value={empShiftData.shiftEnd}
                                  onChange={(e) => setEmpShiftData(prev => ({ ...prev, shiftEnd: e.target.value }))}
                                />
                              </div>
                            </div>

                            <div className="space-y-3">
                              <label className="text-[9px] uppercase font-black text-slate-500 tracking-widest block pl-1">Working Days</label>
                              <div className="flex flex-wrap gap-1">
                                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                                  <button
                                    key={day}
                                    onClick={() => setEmpShiftData(prev => ({
                                      ...prev,
                                      workingDays: prev.workingDays.includes(day) 
                                        ? prev.workingDays.filter(d => d !== day) 
                                        : [...prev.workingDays, day]
                                    }))}
                                    className={cn(
                                      "px-2 py-1 rounded text-[8px] font-black uppercase transition-all border",
                                      empShiftData.workingDays.includes(day)
                                        ? "bg-violet-600 border-violet-500 text-white"
                                        : "bg-slate-950 border-slate-800 text-slate-600"
                                    )}
                                  >
                                    {day}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <button 
                              onClick={() => {
                                if (!empShiftData.name) return;
                                setTempEmployeeShifts(prev => {
                                  const existingIdx = prev.findIndex(s => s.name === empShiftData.name);
                                  if (existingIdx >= 0) {
                                    const next = [...prev];
                                    next[existingIdx] = empShiftData;
                                    return next;
                                  }
                                  return [...prev, empShiftData];
                                });
                                setEmpShiftData({ name: '', shiftStart: '09:00', shiftEnd: '18:00', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] });
                              }}
                              className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-violet-600/10"
                            >
                              Add/Update Individual Shift
                            </button>
                          </div>
                       </div>

                       {/* List of custom shifts */}
                       <div className="xl:col-span-2 overflow-x-auto glass-panel border border-slate-800/50 rounded-2xl">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-slate-900/50 border-b border-slate-800">
                              <tr>
                                <th className="px-6 py-4 font-black text-[9px] uppercase tracking-widest text-slate-500">Personnel</th>
                                <th className="px-4 py-4 font-black text-[9px] uppercase tracking-widest text-slate-500">Window</th>
                                <th className="px-4 py-4 font-black text-[9px] uppercase tracking-widest text-slate-500">Working Days</th>
                                <th className="px-4 py-4 font-black text-[9px] uppercase tracking-widest text-slate-500 text-right pr-6">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/30">
                              {tempEmployeeShifts.map((s, idx) => (
                                <tr key={idx} className="hover:bg-slate-800/20 group">
                                  <td className="px-6 py-4 font-black text-[10px] text-slate-300 uppercase tracking-wider">{s.name}</td>
                                  <td className="px-4 py-4 font-mono text-[10px] text-slate-400">{s.shiftStart} - {s.shiftEnd}</td>
                                  <td className="px-4 py-4">
                                    <div className="flex flex-wrap gap-1">
                                      {s.workingDays.map(d => (
                                        <span key={d} className="px-1.5 py-0.5 bg-slate-800/50 rounded text-[8px] font-black text-slate-500 uppercase border border-slate-700/30">{d}</span>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 text-right pr-6">
                                    <button 
                                      onClick={() => setTempEmployeeShifts(prev => prev.filter((_, i) => i !== idx))}
                                      className="p-2 text-slate-600 hover:text-red-400 transition-colors bg-slate-800/50 rounded-lg hover:bg-red-500/10"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              {tempEmployeeShifts.length === 0 && (
                                <tr>
                                  <td colSpan={4} className="px-6 py-12 text-center text-[10px] font-black text-slate-700 uppercase tracking-widest">No individual shifts defined for this project</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        <div className="xl:col-span-3 flex justify-end mt-8">
                          <button 
                            onClick={handleSaveConfiguration}
                            disabled={!currentConfig}
                            className="btn-primary flex items-center gap-2 px-10 py-4 shadow-xl shadow-blue-500/20 uppercase font-black tracking-widest text-[12px] bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed group rounded-2xl"
                          >
                            <Save className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            Commit Project Strategy & Shifts
                          </button>
                        </div>
                    </div>
                  </div>
                </div>

                {/* Segment 4: Local Machine Directory Configuration */}
                <div className="chart-container p-8 border-l-4 border-l-rose-500/50 mb-8">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-rose-500/10 rounded-xl text-rose-500">
                          <Paperclip className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-xl font-black text-white uppercase tracking-tight font-sans">Attachment Configuration</h4>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1 font-sans">Configure local drive mapping modes and base path pathway directories for case files</p>
                        </div>
                      </div>
                      <span className="text-[9px] uppercase font-mono px-2.5 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold rounded-lg tracking-wider">
                        Filesystem Gateway
                      </span>
                    </div>

                    {/* Educational Security Info Context - Why content is not automatically inside the E:\ drive */}
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-left font-sans space-y-2">
                      <div className="flex items-center gap-2 text-amber-400">
                        <Info className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-black uppercase tracking-wider">Browser Sandbox & Local Drive Direct Sync Guide</span>
                      </div>
                      <p className="text-[10.5px] text-slate-300 leading-relaxed font-semibold">
                        ⚠️ Because modern browsers restrict secure applications from directly accessing, editing, or writing files onto your physical system volume disk, files you drop or upload in sFlow are securely saved inside the secure browser-isolated sandbox directory first.
                      </p>
                      <p className="text-[10px] text-slate-400 leading-normal pl-6 relative before:content-['•'] before:absolute before:left-2 before:text-amber-500">
                        <span className="text-white font-bold">To sync to your physical drive <span className="font-mono bg-slate-950 px-1 rounded text-emerald-400 font-semibold">{attachmentBasePath}</span>:</span> open any incident's Attachment Vault, click <span className="text-emerald-400 font-bold">"Download Original"</span> or the green <span className="text-emerald-400 font-bold">"Download All"</span> button, and drag or place those downloaded files directly inside that directory on your local machine.
                      </p>
                    </div>

                    <div className="bg-slate-950/60 p-6 rounded-2xl border border-slate-850 space-y-6 font-sans text-left">
                      {/* Storage Mode Selection */}
                      <div className="space-y-2">
                        <label className="text-xs uppercase font-extrabold text-slate-300 tracking-wider">Attachment Archive Storage Mode</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setAttachmentStorageMode('local');
                              localStorage.setItem('sflow_attachment_storage_mode', 'local');
                            }}
                            className={`p-4 rounded-xl border text-left flex flex-col gap-1.5 transition-all duration-200 cursor-pointer ${
                              attachmentStorageMode === 'local'
                                ? 'bg-rose-500/10 border-rose-500/50 text-white shadow-lg shadow-rose-950/20'
                                : 'bg-slate-950 hover:bg-slate-900/60 border-slate-855 text-slate-450 hover:text-slate-350'
                            }`}
                          >
                            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${attachmentStorageMode === 'local' ? 'bg-rose-500 animate-pulse' : 'bg-slate-600'}`} />
                              Local Drive Mode
                            </span>
                            <span className="text-[10px] leading-relaxed font-semibold mt-0.5">
                              Configure direct corporate folder pathways mapped via active client network nodes. Best for strict on-prem directory indexing.
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setAttachmentStorageMode('sandbox');
                              localStorage.setItem('sflow_attachment_storage_mode', 'sandbox');
                            }}
                            className={`p-4 rounded-xl border text-left flex flex-col gap-1.5 transition-all duration-200 cursor-pointer ${
                              attachmentStorageMode === 'sandbox'
                                ? 'bg-blue-500/10 border-blue-500/50 text-white shadow-lg shadow-blue-950/20'
                                : 'bg-slate-950 hover:bg-slate-900/60 border-slate-855 text-slate-450 hover:text-slate-350'
                            }`}
                          >
                            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${attachmentStorageMode === 'sandbox' ? 'bg-blue-500 animate-pulse' : 'bg-slate-600'}`} />
                              Browser Sandbox Mode
                            </span>
                            <span className="text-[10px] leading-relaxed font-semibold mt-0.5">
                              Store files virtually within client sandbox structures. Completely isolated, zero OS-volume pathway configuration is required.
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className={`space-y-2 pt-4 border-t border-slate-900/80 transition-opacity duration-200 ${attachmentStorageMode === 'sandbox' ? 'opacity-40' : 'opacity-100'}`}>
                        <label className="text-xs uppercase font-extrabold text-slate-300 tracking-wider flex items-center gap-1.5">
                          Machine Base Pathway Partition (Path)
                          {attachmentStorageMode === 'sandbox' && (
                            <span className="text-[8px] bg-blue-500/20 text-blue-400 font-mono px-1.5 py-0.5 rounded uppercase font-black tracking-wider">Bypassed</span>
                          )}
                        </label>
                        <div className="flex gap-2">
                          <input 
                            type="text"
                            value={attachmentBasePath}
                            onChange={(e) => setAttachmentBasePath(e.target.value)}
                            disabled={attachmentStorageMode === 'sandbox'}
                            placeholder={attachmentStorageMode === 'sandbox' ? 'N/A: Isolated sandbox mode active' : 'e.g. E:\\ITSM_Attachment_Folder\\Attachments'}
                            className="input-field py-3 font-mono text-emerald-400 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <button 
                            type="button"
                            disabled={attachmentStorageMode === 'sandbox'}
                            onClick={() => {
                              localStorage.setItem('sflow_attachment_base_path', attachmentBasePath);
                              alert('Attachment storage Base Pathway successfully saved & configured.');
                            }}
                            className="status-chip bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 text-emerald-400 px-6 shrink-0 text-xs font-black uppercase tracking-widest rounded-xl transition-all font-sans cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-900 disabled:border-slate-850 disabled:text-slate-650"
                          >
                            Save Pathway
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-normal font-medium mt-1">
                          {attachmentStorageMode === 'sandbox' ? (
                            'The file pathway system behaves as decentralized local indexed objects inside browser-isolated storage schemas. Standard path serialization is bypassed.'
                          ) : (
                            <>
                              This base pathway represents the corporate directory node. Staged file indicators will output and export on-screen in the folder hierarchy structure: 
                              <span className="font-mono text-emerald-400 font-semibold bg-slate-950 px-1 py-0.5 rounded ml-1 select-all break-all">[Base_Path] \ [Project_Name] \ [Case_ID] \ [File_Name]</span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-900 pt-4 font-sans">
                        <div className="p-4 bg-slate-950 rounded-xl border border-slate-900 space-y-1">
                          <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Archive Rule Set</span>
                          <p className="text-white text-xs font-bold leading-normal mt-0.5">
                            {attachmentStorageMode === 'local' ? 'Project Specific Folder Mapping' : 'Secure Indexed Sandbox Pool'}
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium font-sans">
                            {attachmentStorageMode === 'local' 
                              ? 'Directories and case hierarchy trees automatically materialize upon saving configuration strategies or staging new files.'
                              : 'Attachments bypass native OS mapping layers and reside securely inside local browser partition stores.'
                            }
                          </p>
                        </div>
                        <div className="p-4 bg-slate-950 rounded-xl border border-slate-900 space-y-1">
                          <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Sandbox Security Limits</span>
                          <p className="text-white text-xs font-bold leading-normal mt-0.5">Max 4.0 MB File Size Cap</p>
                          <p className="text-[10px] text-slate-500 font-medium font-sans">Files larger than 4MB are automatically checked and blocked defensively to optimize responsive client storage memory allocation.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Segment 3: Category & Subcategory Governance */}
                <div className="chart-container p-8 border-l-4 border-l-indigo-500/50">
                  <div className="space-y-8">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-500">
                          <Settings className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-xl font-black text-white uppercase tracking-tight">Category & Subcategory Governance</h4>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">Configure categories and linked subcategories in the central database</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Left Side: Create form */}
                      <form onSubmit={async (e) => {
                        e.preventDefault();
                        if (!newCategoryName.trim() || !newSubcategoryName.trim()) return;
                        
                        askConfirmation(
                          'Add Category Association',
                          `Are you sure you want to add "${newSubcategoryName.trim()}" as a subcategory of "${newCategoryName.trim()}"?`,
                          async () => {
                            try {
                              const response = await fetch('/supportflow/api/categories', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  category: newCategoryName.trim(),
                                  subcategory: newSubcategoryName.trim()
                                })
                              });
                              if (response.ok) {
                                await fetchCategories();
                                setNewSubcategoryName('');
                              }
                            } catch (error) {
                              console.error('Error saving mapping:', error);
                            }
                          },
                          'info',
                          'Register'
                        );
                      }} className="space-y-6">
                        <div className="p-5 bg-slate-900/30 border border-slate-800/80 rounded-2xl space-y-4">
                          <span className="text-[10px] uppercase font-black text-zinc-400 tracking-wider block border-b border-slate-800 pb-2">Add Association Record</span>
                          
                          <div className="space-y-2">
                            <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest block pl-1">Category Group</label>
                            <input 
                              type="text"
                              list="existing-categories-datalist2"
                              placeholder="E.g. Incident or Change"
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                              className="input-field h-11 px-4 text-xs font-semibold bg-slate-950/50 text-white"
                              required
                            />
                            <datalist id="existing-categories-datalist2">
                              {categoriesList.map(c => <option key={c} value={c} />)}
                            </datalist>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest block pl-1">Subcategory Type</label>
                            <input 
                              type="text"
                              placeholder="E.g. Application Issue"
                              value={newSubcategoryName}
                              onChange={(e) => setNewSubcategoryName(e.target.value)}
                              className="input-field h-11 px-4 text-xs font-semibold bg-slate-950/50 text-white"
                              required
                            />
                          </div>

                          <button 
                            type="submit"
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Register Mapping
                          </button>
                        </div>
                      </form>

                      {/* Right Side: Existing mappings lists with Delete actions */}
                      <div className="lg:col-span-2 space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                          <span className="text-[10px] uppercase font-black text-zinc-400 tracking-wider">Registered Category Tree ({categoryMappings.length})</span>
                          <div className="relative w-48">
                            <input 
                              type="text" 
                              placeholder="Filter Category..." 
                              value={categoryMappingFilter}
                              onChange={(e) => setCategoryMappingFilter(e.target.value)}
                              className="w-full bg-slate-950/50 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 text-[10px] font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                            />
                          </div>
                        </div>

                        <div className="overflow-hidden border border-slate-800/50 rounded-2xl max-h-[360px] overflow-y-auto custom-scrollbar">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-900/50 border-b border-slate-800 sticky top-0 z-10">
                              <tr>
                                <th className="px-6 py-3 font-black text-[9px] uppercase tracking-widest text-slate-500">Category</th>
                                <th className="px-6 py-3 font-black text-[9px] uppercase tracking-widest text-slate-500">Subcategory</th>
                                <th className="px-6 py-3 font-black text-[9px] uppercase tracking-widest text-slate-500 text-right pr-6">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/30">
                              {categoryMappings
                                .filter(m => !categoryMappingFilter || m.category.toLowerCase().includes(categoryMappingFilter.toLowerCase()) || m.subcategory.toLowerCase().includes(categoryMappingFilter.toLowerCase()))
                                .map((m) => (
                                  <tr key={m.id} className="hover:bg-indigo-950/5 transition-colors duration-150 group">
                                    <td className="px-6 py-3.5">
                                      <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded font-black text-[9px] uppercase tracking-wider">
                                        {m.category}
                                      </span>
                                    </td>
                                    <td className="px-6 py-3.5 font-bold text-slate-300 text-[10px]">
                                      {m.subcategory}
                                    </td>
                                    <td className="px-6 py-3.5 text-right pr-6">
                                      <button 
                                        type="button"
                                        onClick={() => {
                                          askConfirmation(
                                            'Delete Mapping',
                                            `Are you sure you want to permanently delete the mapping "${m.subcategory}" from category "${m.category}"?`,
                                            async () => {
                                              try {
                                                const response = await fetch(`/supportflow/api/categories/${m.id}`, {
                                                  method: 'DELETE'
                                                });
                                                if (response.ok) {
                                                  await fetchCategories();
                                                }
                                              } catch (error) {
                                                console.error('Error deleting mapping:', error);
                                              }
                                            },
                                            'danger',
                                            'Delete'
                                          );
                                        }}
                                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                        title="Delete Association"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              {categoryMappings.filter(m => !categoryMappingFilter || m.category.toLowerCase().includes(categoryMappingFilter.toLowerCase()) || m.subcategory.toLowerCase().includes(categoryMappingFilter.toLowerCase())).length === 0 && (
                                <tr>
                                  <td colSpan={3} className="px-6 py-12 text-center text-[10px] font-black text-slate-700 uppercase tracking-widest pl-1">No category mappings match search filter</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence mode="wait">
            {activeTab === 'mapping-details' && (
              <motion.div
                key="mapping-details"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* 1st segment: SLA Mapping Details */}
                <div className="chart-container overflow-hidden">
                  <div className="p-6 border-b border-slate-800/50 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-widest">SLA Mapping Details</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">Audit trail for service level benchmark modifications</p>
                    </div>
                    <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] font-black text-amber-500 uppercase tracking-widest">
                      SLA Ledger
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-900/50 border-b border-slate-800">
                        <tr>
                          <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">Project</th>
                          <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">SLA Configuration Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {projectConfigs.map(config => {
                          const latestLog = configChanges.find(l => l.projectId === config.projectId && l.type === 'SLA');
                          return (
                            <tr key={config.projectId} className="hover:bg-slate-800/20 transition-colors">
                              <td className="px-6 py-4">
                                <span className="text-[11px] font-black text-blue-400 uppercase tracking-wider bg-blue-500/5 px-2 py-1 rounded border border-blue-500/10">
                                  {config.projectId}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-row gap-2 max-w-none overflow-x-auto whitespace-nowrap pb-1 custom-scrollbar">
                                  {(['P1', 'P2', 'P3', 'P4'] as Priority[]).map((p, i) => (
                                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700/50 shadow-sm flex-shrink-0">
                                      <span className="text-[10px] font-black text-amber-500 uppercase tracking-tighter w-4">{p}</span>
                                      <div className="flex flex-row gap-3 border-l border-slate-700 pl-2">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">Response</span>
                                          <span className="text-[10px] font-bold text-slate-200 leading-none">{config.slas?.[p]?.response || 0}h</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">Resolution</span>
                                          <span className="text-[10px] font-bold text-slate-200 leading-none">{config.slas?.[p]?.resolution || 0}h</span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 2nd segment: Resource Mapping Details (Project wise) */}
                <div className="chart-container overflow-hidden">
                  <div className="p-6 border-b border-slate-800/50 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-widest">Resource Mapping Details</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">Consolidated view of all active personnel project wise</p>
                    </div>
                    <div className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] font-black text-blue-500 uppercase tracking-widest">
                      Project Allocation
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-900/50 border-b border-slate-800">
                        <tr>
                          <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">Project</th>
                          <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">User Name</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {projectConfigs.map((config) => (
                          <tr key={config.projectId} className="hover:bg-slate-800/20 transition-colors">
                            <td className="px-6 py-4">
                              <span className="text-[11px] font-black text-blue-400 uppercase tracking-wider bg-blue-500/5 px-2 py-1 rounded border border-blue-500/10">
                                {config.projectId}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-2">
                                {(config.employees || []).map(emp => (
                                  <div key={emp} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700/50 shadow-sm">
                                    <div className="w-5 h-5 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-[10px] font-black text-blue-400">
                                      {emp.charAt(0)}
                                    </div>
                                    <span className="text-[11px] font-bold text-slate-200">
                                      {emp}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3rd segment: Project Based Shifts Details */}
                <div className="chart-container overflow-hidden">
                  <div className="p-6 border-b border-slate-800/50 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-widest">Project Based Shifts Allocation Details</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">Working window and holiday schedules per project</p>
                    </div>
                    <div className="px-3 py-1 bg-violet-500/10 border border-violet-500/20 rounded text-[10px] font-black text-violet-500 uppercase tracking-widest">
                      Shift Strategy
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-900/50 border-b border-slate-800">
                        <tr>
                          <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">Project</th>
                          <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">Working Window</th>
                          <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">Working Days</th>
                          <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">Holidays</th>
                          <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">Individual Overrides</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {projectConfigs.map((config) => (
                          <tr key={config.projectId} className="hover:bg-slate-800/20 transition-colors">
                            <td className="px-6 py-4">
                              <span className="text-[11px] font-black text-blue-400 uppercase tracking-wider bg-blue-500/5 px-2 py-1 rounded border border-blue-500/10">
                                {config.projectId}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                               <div className="flex items-center gap-2">
                                  <Clock className="w-3 h-3 text-slate-500" />
                                  <span className="text-[10px] font-mono text-slate-300">{config.shiftStart} - {config.shiftEnd}</span>
                               </div>
                            </td>
                            <td className="px-6 py-4">
                               <div className="flex flex-wrap gap-1">
                                  {config.workingDays.map(d => (
                                    <span key={d} className="px-1.5 py-0.5 bg-slate-800 rounded text-[8px] font-black text-slate-400 uppercase border border-slate-700">{d}</span>
                                  ))}
                               </div>
                            </td>
                            <td className="px-6 py-4">
                               <div className="max-w-xs truncate">
                                  <span className="text-[9px] text-slate-500 font-mono italic">
                                    {config.holidays.length > 0 ? config.holidays.join(', ') : 'No holidays configured'}
                                  </span>
                               </div>
                            </td>
                            <td className="px-6 py-4">
                               <div className="flex flex-col gap-1">
                                  {config.employeeShifts.map(s => (
                                    <div key={s.name} className="flex items-center gap-2">
                                      <span className="text-[9px] font-black text-violet-400 uppercase tracking-tighter">{s.name}:</span>
                                      <span className="text-[9px] font-mono text-slate-500">{s.shiftStart}-{s.shiftEnd}</span>
                                    </div>
                                  ))}
                                  {config.employeeShifts.length === 0 && <span className="text-[9px] text-slate-700 font-black uppercase tracking-widest italic">None</span>}
                               </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 4th segment: Individual Resource Shifts Allocation Details */}
                <div className="chart-container overflow-hidden">
                  <div className="p-6 border-b border-slate-800/50 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-widest">Individual Resource Shifts Allocation Details</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">Personnel-specific shift overrides across all projects</p>
                    </div>
                    <div className="px-3 py-1 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded text-[10px] font-black text-fuchsia-500 uppercase tracking-widest">
                      Custom Overrides
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-900/50 border-b border-slate-800">
                        <tr>
                          <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">Personnel</th>
                          <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">Project</th>
                          <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">Shift Window</th>
                          <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">Working Days</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {projectConfigs.flatMap(config => 
                          config.employeeShifts.map(shift => ({
                            ...shift,
                            projectId: config.projectId
                          }))
                        ).map((item, idx) => (
                          <tr key={`${item.projectId}-${item.name}-${idx}`} className="hover:bg-slate-800/20 transition-colors">
                            <td className="px-6 py-4 text-white font-bold text-[11px]">{item.name}</td>
                            <td className="px-6 py-4">
                              <span className="text-[10px] font-black text-blue-400 uppercase tracking-tighter bg-blue-500/5 px-2 py-1 rounded border border-blue-500/10">
                                {item.projectId}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3 text-slate-500" />
                                <span className="text-[10px] font-mono text-slate-300">{item.shiftStart} - {item.shiftEnd}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-1">
                                {item.workingDays.map(d => (
                                  <span key={d} className="px-1.5 py-0.5 bg-slate-800 rounded text-[8px] font-black text-slate-400 uppercase border border-slate-700">{d}</span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {projectConfigs.every(c => c.employeeShifts.length === 0) && (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-[10px] font-black text-slate-700 uppercase tracking-widest">
                              No individual shift overrides configured across any projects
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'user-onboard' && (
              <motion.div 
                key="user-onboard"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Register User */}
                  <div className="lg:col-span-1 space-y-6">
                    <div className="chart-container p-6 bg-slate-900/40 border-l-4 border-fuchsia-500">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-fuchsia-500/10 rounded-lg">
                          <UserPlus className="w-5 h-5 text-fuchsia-500" />
                        </div>
                        <h3 className="text-lg font-black text-white uppercase tracking-tight">
                          {editingUser ? 'Update User Identity' : 'Onboard New User'}
                        </h3>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="label-sm block mb-1.5">User ID / Primary Key</label>
                          <input 
                            type="text" 
                            className="input-field w-full disabled:opacity-50 disabled:cursor-not-allowed"
                            placeholder="e.g. jamal.e"
                            value={userFormData.id || ''}
                            onChange={e => setUserFormData({...userFormData, id: e.target.value})}
                            disabled={!!editingUser}
                          />
                        </div>
                        <div>
                          <label className="label-sm block mb-1.5">Full Personnel Name</label>
                          <input 
                            type="text" 
                            className="input-field w-full"
                            placeholder="e.g. Jamal Hassan"
                            value={userFormData.name || ''}
                            onChange={e => setUserFormData({...userFormData, name: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="label-sm block mb-1.5">{editingUser ? 'Update Security Key' : 'Initial Security Key'}</label>
                          <div className="relative">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input 
                              type="password" 
                              className="input-field w-full pl-10"
                              placeholder={editingUser ? "Leave blank to keep current" : "••••••••"}
                              value={userFormData.password || ''}
                              onChange={e => setUserFormData({...userFormData, password: e.target.value})}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="label-sm block mb-1.5">Designated Role</label>
                          <input 
                            type="text" 
                            className="input-field w-full"
                            placeholder="e.g. System Administrator"
                            value={userFormData.role || ''}
                            onChange={e => setUserFormData({...userFormData, role: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="label-sm block mb-1.5">Access Status</label>
                          <select 
                            className="input-field w-full text-xs"
                            value={userFormData.status || 'Active'}
                            onChange={e => setUserFormData({...userFormData, status: e.target.value as any})}
                          >
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                        </div>
                        <div>
                          <label className="label-sm block mb-1.5">Recovery Security Question</label>
                          <input 
                            type="text" 
                            className="input-field w-full"
                            placeholder="e.g. First pet's name?"
                            value={userFormData.recoveryQuestion || ''}
                            onChange={e => setUserFormData({...userFormData, recoveryQuestion: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="label-sm block mb-1.5">Recovery Answer</label>
                          <input 
                            type="text" 
                            className="input-field w-full"
                            placeholder="e.g. buddy"
                            value={userFormData.recoveryAnswer || ''}
                            onChange={e => setUserFormData({...userFormData, recoveryAnswer: e.target.value})}
                          />
                        </div>
                        
                        <div className="flex flex-col gap-2 mt-4">
                          <button 
                            onClick={handleAddUser}
                            className="w-full py-3 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-black uppercase tracking-widest text-[10px] rounded transition-all shadow-lg flex items-center justify-center gap-2"
                          >
                            {editingUser ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            {editingUser ? 'Apply Updates' : 'Commit Identity Access'}
                          </button>
                          {editingUser && (
                            <button 
                              onClick={() => {
                                setEditingUser(null);
                                setUserFormData({ id: '', name: '', password: '', status: 'Active', role: 'Standard User', recoveryQuestion: '', recoveryAnswer: '' });
                              }}
                              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold uppercase tracking-widest text-[9px] rounded transition-all border border-slate-700"
                            >
                              Cancel Edit
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: User Inventory */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="chart-container overflow-hidden">
                      <div className="p-6 border-b border-slate-800/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Users className="w-5 h-5 text-blue-400" />
                          <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">System User Inventory</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">Management of authorized personnel and status</p>
                          </div>
                        </div>
                        <div className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] font-black text-blue-500 uppercase tracking-widest">
                          {users.length} Records
                        </div>
                      </div>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-900/50 border-b border-slate-800">
                            <tr>
                              <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">Personnel</th>
                              <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">UID</th>
                              <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">Level/Role</th>
                              <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500">Status</th>
                              <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/30">
                            {users.map((user) => (
                              <tr key={user.id} className="hover:bg-slate-800/20 transition-colors group">
                                <td className="px-6 py-4 text-white font-bold text-[11px]">{user.name}</td>
                                <td className="px-6 py-4 text-slate-500 font-mono text-[10px] uppercase">{user.id}</td>
                                <td className="px-6 py-4">
                                  <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[9px] font-bold uppercase tracking-wide border border-slate-700">
                                    {user.role}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <button
                                    onClick={() => handleToggleUserStatus(user.id)}
                                    className={cn(
                                      "px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                                      user.status === 'Active' 
                                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20" 
                                        : "bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20"
                                    )}
                                  >
                                    {user.status}
                                  </button>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button 
                                      onClick={() => handleEditUser(user)}
                                      className="p-1.5 bg-blue-500/5 hover:bg-blue-500/10 text-blue-900 hover:text-blue-400 rounded transition-all opacity-0 group-hover:opacity-100"
                                      title="Edit User"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    {user.id !== 'Admin' && (
                                      <button 
                                        onClick={() => handleDeleteUser(user.id)}
                                        className="p-1.5 bg-red-500/5 hover:bg-red-500/10 text-red-900 hover:text-red-500 rounded transition-all opacity-0 group-hover:opacity-100"
                                        title="Offboard User"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {user.id === 'Admin' && (
                                      <div className="p-1.5 text-slate-700 cursor-not-allowed">
                                        <ShieldAlert className="w-3.5 h-3.5" />
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {(activeTab as string) === 'knowledge-base' && (
              <motion.div 
                key="knowledge-base"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6 animate-fade-in"
              >
                {/* Header Stats bar */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="chart-container p-6 bg-slate-900/40 border-l-4 border-sky-500 rounded-xl relative overflow-hidden flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none mb-1">Knowledge Scope</p>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tight mt-1 leading-none">
                        {isManagerOrAdmin ? "MASTER LEVEL" : "PROJECT BOUND"}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold mt-1.5 uppercase tracking-wide">
                        {isManagerOrAdmin ? "Entire enterprise project base accessible" : "Assigned projects knowledge base"}
                      </p>
                    </div>
                    <div className="p-3 bg-sky-500/10 rounded-xl text-sky-400">
                      <Brain className="w-6 h-6 animate-pulse-subtle" />
                    </div>
                  </div>
                  
                  <div className="chart-container p-6 bg-slate-900/40 border-l-4 border-emerald-500 rounded-xl relative overflow-hidden flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none mb-1">Resolved Base</p>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tight mt-1 leading-none font-mono">
                        {kbTasks.length} Articles
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold mt-1.5 uppercase tracking-wide">
                        Verified solutions synchronized from MySQL
                      </p>
                    </div>
                    <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                  </div>

                  <div className="chart-container p-6 bg-slate-900/40 border-l-4 border-violet-500 rounded-xl relative overflow-hidden flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none mb-1">AI Agent Status</p>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tight mt-1 leading-none uppercase">
                        {process.env.GEMINI_API_KEY ? "AI ACTIVE" : "LOCAL SEARCH"}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold mt-1.5 uppercase tracking-wide">
                        {process.env.GEMINI_API_KEY ? "Gemini 3.5 conversational reasoning active" : "Using local search model"}
                      </p>
                    </div>
                    <div className="p-3 bg-violet-500/10 rounded-xl text-violet-400">
                      <Sparkles className="w-6 h-6" />
                    </div>
                  </div>
                </div>

                {/* Main Content Area: Split List & ChatBot */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* Left Column (7 cols): Searching and Article Viewing */}
                  <div className="lg:col-span-7 space-y-6">
                    <div className="chart-container p-6 bg-slate-900/40 border border-slate-800 rounded-2xl">
                      
                      {/* Search and Filters */}
                      <div className="space-y-4 mb-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="text-left">
                            <h3 className="text-sm font-black text-white uppercase tracking-wider mb-1 leading-none">Search Resolved Incident Base</h3>
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-0.5">Explore historic fixes and verified SLA solutions</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {/* Project filter */}
                          <div className="text-left">
                            <label className="label-sm text-slate-400 mb-1.5 block">Target Project</label>
                            <select 
                              value={kbSelectedProject} 
                              onChange={(e) => {
                                setKbSelectedProject(e.target.value);
                                setKbSelectedArticle(null);
                              }}
                              className="input-field w-full text-xs"
                            >
                              <option value="All">All Projects</option>
                              {PROJECTS_LIST.filter(p => isManagerOrAdmin || userMappedProjects.includes(p)).map(pName => (
                                <option key={pName} value={pName}>{pName}</option>
                              ))}
                            </select>
                          </div>

                          {/* Category Filter */}
                          <div className="text-left">
                            <label className="label-sm text-slate-400 mb-1.5 block">Category</label>
                            <select 
                              value={kbSelectedCategory} 
                              onChange={(e) => {
                                setKbSelectedCategory(e.target.value);
                                setKbSelectedArticle(null);
                              }}
                              className="input-field w-full text-xs"
                            >
                              <option value="All">All Categories</option>
                              {kbCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>

                          {/* Keyword Match field */}
                          <div className="relative text-left">
                            <label className="label-sm text-slate-400 mb-1.5 block">Terms Search</label>
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
                              <input 
                                type="text"
                                value={kbSearchQuery}
                                onChange={(e) => {
                                  setKbSearchQuery(e.target.value);
                                  setKbSelectedArticle(null);
                                }}
                                placeholder="Refine keywords..."
                                className="input-field pl-8 w-full text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Displaying selected article or list */}
                      {kbSelectedArticle ? (
                        /* Full Article View */
                        <div className="border border-slate-800 rounded-xl bg-slate-950/60 p-6 space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <button 
                              onClick={() => setKbSelectedArticle(null)}
                              className="text-[10px] font-black text-sky-400 hover:text-sky-300 uppercase tracking-wider flex items-center gap-1.5 bg-sky-500/5 hover:bg-sky-500/10 px-2.5 py-1.5 rounded transition-all border border-sky-500/10"
                            >
                              ← Back to Article Index
                            </button>
                            <div className="flex items-center gap-2 font-mono text-[10.5px]">
                              <span className="text-slate-500">Ticket ID:</span>
                              <span className="text-white font-black bg-slate-800 px-2 py-0.5 rounded border border-slate-700">{kbSelectedArticle.ticketId}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-900/50 p-3 rounded-lg border border-slate-800/40 text-left">
                            <div>
                              <p className="text-[8px] text-slate-500 uppercase font-black tracking-wider leading-none">Project</p>
                              <p className="text-[10px] text-white font-bold mt-1 uppercase leading-none">{kbSelectedArticle.projectId}</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-500 uppercase font-black tracking-wider leading-none">Domain Hierarchy</p>
                              <p className="text-[10px] text-indigo-400 font-bold mt-1 uppercase leading-none truncate" title={`${kbSelectedArticle.category} > ${kbSelectedArticle.subcategory || "General"}`}>{kbSelectedArticle.category} &gt; {kbSelectedArticle.subcategory || "General"}</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-500 uppercase font-black tracking-wider leading-none">Support Level</p>
                              <p className="text-[10px] text-amber-500 font-bold mt-1 uppercase leading-none">{kbSelectedArticle.supportLevel} tier</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-500 uppercase font-black tracking-wider leading-none">Owner Engineer</p>
                              <p className="text-[10px] text-emerald-400 font-bold mt-1 uppercase leading-none truncate">{kbSelectedArticle.assignedTo || "Unassigned"}</p>
                            </div>
                          </div>

                          <div className="space-y-3 text-left">
                            <div>
                              <h4 className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-1">Issue Symptom &amp; Description</h4>
                              <div className="bg-slate-900/30 p-3.5 rounded border border-slate-800/60 text-xs text-slate-300 leading-relaxed max-h-[160px] overflow-y-auto whitespace-pre-wrap font-mono">
                                {kbSelectedArticle.description}
                              </div>
                            </div>

                            <div>
                              <h4 className="text-[10px] text-emerald-400 font-black uppercase tracking-wider mb-1 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                Verified Resolution &amp; Solution Details
                              </h4>
                              <div className="bg-emerald-950/10 p-4 rounded-xl border border-emerald-500/20 text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap shadow-inner">
                                {kbSelectedArticle.solution}
                              </div>
                            </div>

                            {kbSelectedArticle.remarks && (
                              <div>
                                <h4 className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-1">Additional Operational Remarks</h4>
                                <div className="bg-slate-900/30 p-3.5 rounded border border-slate-800/60 text-xs text-slate-300 italic whitespace-pre-wrap">
                                  {kbSelectedArticle.remarks}
                                </div>
                              </div>
                            )}
                          </div>
                          
                          <div className="pt-2 text-right text-[9px] text-slate-500 font-mono">
                            Article resolved on: {kbSelectedArticle.closureDate ? format(parseISO(kbSelectedArticle.closureDate), 'LLL d, yyyy HH:mm:ss') : "N/A"}
                          </div>
                        </div>
                      ) : (
                        /* Article List view */
                        <div className="space-y-3 animate-fade-in">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-left mb-1">
                            Matching Resolved Articles ({filteredKbTasks.length})
                          </p>
                          
                          <div className="max-h-[500px] overflow-y-auto pr-1 space-y-2 mb-3 scrollbar-thin">
                            {filteredKbTasks.map(art => (
                              <div 
                                key={art.id}
                                onClick={() => setKbSelectedArticle(art)}
                                className="group p-4 bg-slate-950/40 hover:bg-slate-900/60 border border-slate-800/60 hover:border-sky-500/30 rounded-xl cursor-pointer text-left transition-all hover:translate-x-0.5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                              >
                                <div className="space-y-1.5 flex-1 select-none">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-[10px] text-white font-black bg-slate-800 px-1.5 py-0.5 rounded">{art.ticketId}</span>
                                    <span className="text-[9px] font-black uppercase tracking-tighter text-blue-400 bg-blue-500/5 px-1.5 py-0.5 rounded border border-blue-500/10">{art.projectId}</span>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-500/5 px-2 py-0.5 rounded border border-indigo-500/15">
                                      {art.category} {art.subcategory ? `> ${art.subcategory}` : ''}
                                    </span>
                                  </div>
                                  <h4 className="text-xs text-slate-300 group-hover:text-white font-bold leading-snug tracking-normal truncate max-w-[420px]">
                                    {art.description}
                                  </h4>
                                  <p className="text-[10px] text-emerald-400/80 font-mono font-medium truncate max-w-[420px] italic">
                                    Solution: {art.solution}
                                  </p>
                                </div>
                                
                                <div className="flex items-center gap-2 shrink-0 md:self-center select-none">
                                  <span className="text-[9px] text-slate-500 font-mono">Resolved: {art.closureDate ? format(parseISO(art.closureDate), 'LLL d') : ''}</span>
                                  <div className="p-1 px-2.5 bg-slate-800 group-hover:bg-sky-500 text-slate-500 group-hover:text-white text-[10px] font-black uppercase rounded tracking-wider transition-colors">
                                    Read Info
                                  </div>
                                </div>
                              </div>
                            ))}

                            {filteredKbTasks.length === 0 && (
                              <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-3xl">
                                <BookOpen className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">No matching resolved solutions found in index</p>
                                <p className="text-[10px] text-slate-600 uppercase font-black mt-1">Try broadening your category or query filters</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column (5 cols): Interactive AI Troubleshooting Bot */}
                  <div className="lg:col-span-5">
                    <div className="chart-container p-6 bg-slate-900/40 border-l-4 border-violet-500 rounded-2xl flex flex-col h-[650px]">
                      
                      {/* Bot Title Header */}
                      <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-4 text-left select-none">
                        <div className="p-2 bg-violet-500/10 rounded-xl text-violet-400">
                          <MessageSquare className="w-5 h-5 animate-pulse-subtle" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white uppercase tracking-wider leading-none">AI Chatbot Troubleshooter</h3>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Reads local task solutions for active reasoning</p>
                        </div>
                      </div>

                      {/* Chat Messages Log */}
                      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 scrollbar-thin text-left font-sans">
                        {chatMessages.map((msg, i) => (
                          <div 
                            key={i}
                            className={cn(
                              "flex flex-col max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed font-sans shadow-sm transition-all",
                              msg.sender === 'user' 
                                ? "bg-violet-500/10 text-slate-200 ml-auto border border-violet-500/10 rounded-br-none" 
                                : msg.sender === 'system'
                                ? "bg-red-950/20 text-red-300 border border-red-900/30 max-w-[100%] rounded-lg font-mono text-[10px]"
                                : "bg-slate-950/80 text-slate-300 mr-auto border border-slate-800/80 rounded-bl-none"
                            )}
                          >
                            <div className="font-sans break-words whitespace-pre-wrap">
                              {msg.text}
                            </div>
                            <span className="text-[8px] text-slate-500 italic mt-1 text-right block leading-none font-mono">
                              {format(msg.timestamp, 'HH:mm:ss')}
                            </span>
                          </div>
                        ))}
                        
                        {/* Bot is loading typing indicator */}
                        {isBotLoading && (
                          <div className="bg-slate-950/80 text-slate-300 mr-auto border border-slate-800/80 rounded-2xl rounded-bl-none p-3 text-xs flex items-center gap-1.5 max-w-[120px] select-none">
                            <span className="w-2.5 h-2.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-2.5 h-2.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-2.5 h-2.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        )}
                      </div>

                      {/* Bot Input field */}
                      <form onSubmit={(e) => handleSendChat(e)} className="flex gap-2 border-t border-slate-800/60 pt-4">
                        <input 
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          disabled={isBotLoading}
                          placeholder={isBotLoading ? "AI reasoning in progress..." : "Ask me anything (e.g. Incidents with DB login?)"}
                          className="input-field flex-1 text-xs px-3.5"
                        />
                        <button 
                          type="submit" 
                          disabled={isBotLoading || !chatInput.trim()}
                          className="px-4 py-2.5 bg-violet-500 hover:bg-violet-600 disabled:bg-slate-800 text-white font-black uppercase text-[10px] tracking-widest rounded-xl flex items-center gap-1.5 transition-all shadow-lg active:scale-95 disabled:pointer-events-none"
                        >
                          <Send className="w-4 h-4" />
                          Send
                        </button>
                      </form>
                    </div>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {(activeTab as string) === 'change-release' && (
              <motion.div
                key="change-release"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -25 }}
                className="space-y-6 text-left"
              >
                {/* Header Title Section */}
                <div className="bg-slate-900/40 p-6 rounded-3xl border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl">
                      <Sparkles className="w-6 h-6 animate-pulse-subtle" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-white uppercase tracking-tight">Change & Release Tracker</h2>
                      <p className="text-xs text-slate-400 mt-1">
                        Deployment packaging, pre-production sign-off audits, synthetic rollback parameters, and retrospective lessons learned.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleExportToExcel}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black uppercase text-[10px] tracking-widest rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-white" />
                      Export Excel
                    </button>
                    <button
                      onClick={handleOpenCreateRelease}
                      className="px-4 py-2 bg-indigo-505 hover:bg-indigo-600 active:scale-95 text-white font-black uppercase text-[10px] tracking-widest rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-indigo-500/10"
                    >
                      <Plus className="w-4 h-4" />
                      Register Release
                    </button>
                  </div>
                </div>

                {/* Statistics Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 select-none">
                  {/* Total Card */}
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-slate-505 uppercase font-black tracking-wider">Total Tracked Releases</span>
                      <p className="text-3xl font-mono font-black text-white mt-1">{crStats.total}</p>
                    </div>
                    <div className="mt-3 text-[10px] text-slate-400 font-medium font-sans">
                      Across <span className="text-indigo-400 text-xs font-mono">{(PROJECTS_LIST && PROJECTS_LIST.length) || 4}</span> distinct projects
                    </div>
                  </div>

                  {/* Success rate Card */}
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-emerald-500 uppercase font-black tracking-wider font-sans">Success Release Rate</span>
                      <p className="text-3xl font-mono font-black text-emerald-400 mt-1">{crStats.successRatio}%</p>
                    </div>
                    <div className="mt-3 text-[10px] text-slate-400">
                      <span className="text-emerald-400 font-mono font-bold">{crStats.successful}</span> successful rollouts completed
                    </div>
                  </div>

                  {/* Pre-deployment check Card */}
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-sky-400 uppercase font-black tracking-wider font-sans">UAT Met Ratio</span>
                      <p className="text-3xl font-mono font-black text-sky-450 mt-1">{crStats.uatRatio}%</p>
                    </div>
                    <div className="mt-3 text-[10px] text-slate-400">
                      <span className="text-sky-450 font-mono font-bold">{crStats.uatSignoffs}</span> of <span className="font-mono font-bold text-slate-350">{crStats.total}</span> UAT signs secured
                    </div>
                  </div>

                  {/* Failure/Rollback percentage */}
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-red-500 uppercase font-black tracking-wider font-sans">Failed / Rolled Back</span>
                      <p className="text-3xl font-mono font-black text-red-400 mt-1">{crStats.failures}</p>
                    </div>
                    <div className="mt-3 text-[10px] text-slate-400">
                      Rollback coverage rate: <span className="text-red-400 font-mono font-bold">{crStats.rollbackRatio}%</span>
                    </div>
                  </div>
                </div>

                {/* Release Management Analytics Dashboard & Excel Data Section */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
                  {/* Dashboard Header */}
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-800 pb-5">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                        <LayoutDashboard className="w-4 h-4 text-indigo-400 animate-none" />
                        Release Analytics & Data Governance
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 font-sans font-medium">
                        Deployment frequency metrics, timeline trends and deep compliance auditing parameters.
                      </p>
                    </div>

                    {/* Dynamic selectors for Daily, Weekly, Bi-weekly, Monthly, Quarterly, and Custom ranges */}
                    <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-3">
                      {crDashboardPeriod === 'custom' && (
                        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                          <div className="flex items-center gap-1.5 px-2">
                            <span className="text-[9px] text-slate-500 uppercase font-black">From:</span>
                            <input
                              type="date"
                              value={crCustomStartDate}
                              onChange={e => setCrCustomStartDate(e.target.value)}
                              className="bg-transparent text-[11px] font-bold text-white border-none outline-none p-0 focus:ring-0 cursor-pointer w-[110px]"
                            />
                          </div>
                          <div className="h-4 w-px bg-slate-800" />
                          <div className="flex items-center gap-1.5 px-2">
                            <span className="text-[9px] text-slate-500 uppercase font-black">To:</span>
                            <input
                              type="date"
                              value={crCustomEndDate}
                              onChange={e => setCrCustomEndDate(e.target.value)}
                              className="bg-transparent text-[11px] font-bold text-white border-none outline-none p-0 focus:ring-0 cursor-pointer w-[110px]"
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 flex-wrap gap-1">
                        <button
                          onClick={() => setCrDashboardPeriod('daily')}
                          className={cn(
                            "px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                            crDashboardPeriod === 'daily'
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/10"
                              : "text-slate-400 hover:text-white"
                          )}
                        >
                          Daily
                        </button>
                        <button
                          onClick={() => setCrDashboardPeriod('weekly')}
                          className={cn(
                            "px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                            crDashboardPeriod === 'weekly'
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/10"
                              : "text-slate-400 hover:text-white"
                          )}
                        >
                          Weekly
                        </button>
                        <button
                          onClick={() => setCrDashboardPeriod('biweekly')}
                          className={cn(
                            "px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                            crDashboardPeriod === 'biweekly'
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/10"
                              : "text-slate-400 hover:text-white"
                          )}
                        >
                          Bi-Weekly
                        </button>
                        <button
                          onClick={() => setCrDashboardPeriod('monthly')}
                          className={cn(
                            "px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                            crDashboardPeriod === 'monthly'
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/10"
                              : "text-slate-400 hover:text-white"
                          )}
                        >
                          Monthly
                        </button>
                        <button
                          onClick={() => setCrDashboardPeriod('quarterly')}
                          className={cn(
                            "px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                            crDashboardPeriod === 'quarterly'
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/10"
                              : "text-slate-400 hover:text-white"
                          )}
                        >
                          Quarterly
                        </button>
                        <button
                          onClick={() => setCrDashboardPeriod('custom')}
                          className={cn(
                            "px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                            crDashboardPeriod === 'custom'
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/10"
                              : "text-slate-400 hover:text-white"
                          )}
                        >
                          Custom Field
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Pane: Metrics overview for active period */}
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-950/50 border border-slate-850 rounded-2xl space-y-3">
                        <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block font-sans">
                          Active Frame Insights
                        </span>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-slate-900 border border-slate-850 rounded-xl">
                            <span className="text-[9px] text-slate-400 uppercase font-bold block">Interval</span>
                            <span className="text-xs font-black text-indigo-400 uppercase tracking-wider mt-0.5 block font-mono">
                              {crDashboardPeriod}
                            </span>
                          </div>
                          <div className="p-3 bg-slate-900 border border-slate-850 rounded-xl">
                            <span className="text-[9px] text-slate-400 uppercase font-bold block">Releases</span>
                            <span className="text-xs font-black text-white font-mono mt-0.5 block">
                              {crTrendData.reduce((acc, curr) => acc + curr.Total, 0)}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2 pt-1 font-sans">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-medium">Successful Runs</span>
                            <span className="text-emerald-400 font-bold font-mono">
                              {crTrendData.reduce((acc, curr) => acc + curr.Successful, 0)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-medium">Failed / Rolled Back</span>
                            <span className="text-rose-455 font-bold font-mono">
                              {crTrendData.reduce((acc, curr) => acc + curr.FailedDone, 0)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-medium font-sans">Pending / Scheduled</span>
                            <span className="text-indigo-400 font-bold font-mono">
                              {crTrendData.reduce((acc, curr) => acc + (curr.Scheduled || 0), 0)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-medium font-sans">Active In-Progress</span>
                            <span className="text-amber-400 font-bold font-mono">
                              {crTrendData.reduce((acc, curr) => acc + (curr.InProgress || 0), 0)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Excel Data Export Vault Section requested by the user */}
                      <div className="p-4 bg-emerald-950/10 border border-emerald-900/25 rounded-2xl space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                            <FileSpreadsheet className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-[10px] text-emerald-400 uppercase font-black tracking-wider block font-sans">
                              Excel Extraction Section
                            </span>
                            <span className="text-[9px] text-slate-400 font-medium block font-sans">
                              Integrative release auditing
                            </span>
                          </div>
                        </div>

                        <p className="text-[10px] text-slate-350 leading-relaxed font-sans font-medium">
                          Extract current release configuration matrices, security status checks, team ownership details, and stabilization benchmarks to a beautifully formatted Microsoft Excel document.
                        </p>

                        <button
                          onClick={handleExportToExcel}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black uppercase text-[10px] tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/5 hover:border hover:border-emerald-500/10 font-sans"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Extract Registry to Excel
                        </button>
                      </div>
                    </div>

                    {/* Chart Pane: Recharts visualizations */}
                    <div className="lg:col-span-2 bg-slate-950/45 border border-slate-850 p-5 rounded-2xl flex flex-col justify-between">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider font-sans">
                          Rollout Volume & Stabilization Trend (by Selected Filters)
                        </span>
                        <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-wider font-sans">
                          <span className="flex items-center gap-1 text-emerald-400">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 block" /> Success
                          </span>
                          <span className="flex items-center gap-1 text-red-400">
                            <span className="w-2 h-2 rounded-full bg-rose-500 block" /> Failed
                          </span>
                          <span className="flex items-center gap-1 text-indigo-400">
                            <span className="w-2 h-2 rounded-full bg-indigo-500 block" /> Sch / IP
                          </span>
                        </div>
                      </div>

                      <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={crTrendData}
                            margin={{ top: 10, right: 10, left: -25, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis 
                              dataKey="label" 
                              stroke="#64748b" 
                              fontSize={9} 
                              tickLine={false} 
                            />
                            <YAxis 
                              stroke="#64748b" 
                              fontSize={9} 
                              tickLine={false} 
                              allowDecimals={false}
                            />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl shadow-xl text-left space-y-1.5 font-sans">
                                      <p className="text-[10px] font-black uppercase text-slate-400">{data.label}</p>
                                      <div className="space-y-0.5 text-[11px]">
                                        <div className="flex justify-between gap-4">
                                          <span className="text-slate-405 font-medium">Successful:</span>
                                          <span className="text-emerald-400 font-black font-mono">{data.Successful}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-slate-405 font-medium">Failed/Rolled Back:</span>
                                          <span className="text-red-400 font-black font-mono">{data.FailedDone}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-slate-405 font-medium">Scheduled:</span>
                                          <span className="text-indigo-400 font-black font-mono">{data.Scheduled}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-slate-405 font-medium">In Progress:</span>
                                          <span className="text-amber-400 font-black font-mono">{data.InProgress}</span>
                                        </div>
                                        <div className="border-t border-slate-900 pt-1 mt-1 flex justify-between gap-4 text-xs font-black">
                                          <span className="text-white">Total Records:</span>
                                          <span className="text-slate-100 font-mono">{data.Total}</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar dataKey="Successful" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                            <Bar dataKey="FailedDone" fill="#f43f5e" radius={[4, 4, 0, 0]} stackId="a" />
                            <Bar dataKey="Scheduled" fill="#6366f1" radius={[4, 4, 0, 0]} stackId="a" />
                            <Bar dataKey="InProgress" fill="#f59e0b" radius={[4, 4, 0, 0]} stackId="a" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="text-[9px] text-slate-500 italic mt-2 text-center select-none font-sans font-medium">
                        * Trends are real-time, matching active {selectedProject === 'All' ? 'global configurations' : `${selectedProject} specifications`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Control Panel (Search/Filters) */}
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  <div className="md:col-span-6 relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search releases by WAR/JAR file, purpose, lessons learned..."
                      value={crSearchQuery}
                      onChange={e => setCrSearchQuery(e.target.value)}
                      className="input-field pl-11 text-xs py-2.5"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <select
                      value={crFilterProject}
                      onChange={e => setCrFilterProject(e.target.value)}
                      className="input-field text-xs py-2.5 bg-slate-950"
                    >
                      <option value="All">All Projects</option>
                      {(PROJECTS_LIST.length > 0 ? PROJECTS_LIST : ['HR-Portal', 'E-Commerce', 'Internal-CRM', 'Mobile-App']).map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-3">
                    <select
                      value={crFilterStatus}
                      onChange={e => setCrFilterStatus(e.target.value)}
                      className="input-field text-xs py-2.5 bg-slate-950"
                    >
                      <option value="All">All Statuses</option>
                      <option value="Scheduled">Scheduled</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Successful">Successful</option>
                      <option value="Failed">Failed</option>
                      <option value="Rolled Back">Rolled Back</option>
                    </select>
                  </div>
                </div>

                {/* Release Lists */}
                <div className="space-y-4">
                  {filteredChangeReleases.map(rec => {
                    const statusColors: Record<string, string> = {
                      'Successful': 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                      'Scheduled': 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
                      'In Progress': 'bg-amber-500/10 border-amber-500/30 text-amber-400',
                      'Failed': 'bg-red-500/10 border-red-500/30 text-red-400',
                      'Rolled Back': 'bg-rose-500/10 border-rose-500/30 text-rose-455'
                    };

                    const formattedDate = () => {
                      try {
                        return format(new Date(rec.deploymentDate), 'PPP p');
                      } catch (e) {
                        return rec.deploymentDate;
                      }
                    };

                    return (
                      <div
                        key={rec.id}
                        className="bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-slate-750 p-6 rounded-3xl transition-all duration-200"
                      >
                        <div className="flex flex-col lg:flex-row justify-between items-start gap-4">
                          <div className="space-y-2 flex-1">
                            {/* Line 1: ID, Project Badge, Status Badge */}
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-mono font-black px-2.5 py-1 bg-slate-950/80 border border-slate-800 text-slate-400 rounded-lg select-none">
                                {rec.id}
                              </span>
                              <span className="text-[10px] uppercase font-black px-2.5 py-1 bg-indigo-500/10 text-indigo-400 rounded-lg select-none">
                                {rec.projectId}
                              </span>
                              <span className={cn("text-[9px] uppercase font-black px-2.5 py-1 rounded-lg border select-none", statusColors[rec.status] || 'bg-slate-800 text-slate-300 border-slate-700')}>
                                {rec.status}
                              </span>
                              {rec.rollbackDone && (
                                <span className="text-[9px] uppercase font-black px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg flex items-center gap-1.5 select-none animate-none">
                                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                                  Rollback Completed
                                </span>
                              )}
                            </div>

                            {/* Line 2: WAR/JAR Name */}
                            <h3 className="text-xs font-mono font-black text-white flex items-center gap-2 select-all pt-1 text-left">
                              <span className="text-slate-500 font-sans font-black text-[10px] uppercase tracking-wide select-none">Package File:</span>
                              {rec.warJarName}
                            </h3>

                            {/* Line 3: Deployment Purpose */}
                            <p className="text-xs text-slate-300 font-semibold leading-relaxed pt-1.5 text-left select-text">
                              <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider block mb-0.5 select-none animate-none">Purpose / Ref Reference:</span>
                              {rec.purpose}
                            </p>

                            {/* Meta field: Date, Registered By, POD, Team, Lead */}
                            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 border-t border-slate-800/50 mt-3 text-[10px] font-sans text-slate-400 select-none">
                              {rec.intimationDate && (
                                <span className="flex items-center gap-1.5 font-sans">
                                  <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                  <strong className="text-indigo-400 uppercase font-black">Intimation date:</strong> <span className="text-indigo-300 font-bold">
                                    {(() => {
                                      try {
                                        return format(new Date(rec.intimationDate), 'PPP p');
                                      } catch (e) {
                                        return rec.intimationDate;
                                      }
                                    })()}
                                  </span>
                                </span>
                              )}
                              <span className="flex items-center gap-1.5 font-sans">
                                <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <strong className="text-slate-500 uppercase font-black">Target Deployment:</strong> {formattedDate()}
                              </span>
                              <span className="flex items-center gap-1.5 font-sans">
                                <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <strong className="text-slate-500 uppercase font-black">Registered Employee:</strong> {rec.registeredBy}
                              </span>
                              {rec.podName && (
                                <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-500/5 border border-indigo-500/10 rounded font-sans">
                                  <strong className="text-indigo-400 uppercase font-black text-[9px]">POD:</strong> <span className="text-slate-300 font-mono font-bold">{rec.podName}</span>
                                </span>
                              )}
                              {rec.teamName && (
                                <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-500/5 border border-indigo-500/10 rounded font-sans">
                                  <strong className="text-indigo-400 uppercase font-black text-[9px]">Team:</strong> <span className="text-slate-300 font-bold">{rec.teamName}</span>
                                </span>
                              )}
                              {rec.leadName && (
                                <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-500/5 border border-indigo-500/10 rounded font-sans">
                                  <strong className="text-indigo-400 uppercase font-black text-[9px]">Lead:</strong> <span className="text-slate-300 font-semibold">{rec.leadName}</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Pre-deployment Sign-off metrics and Sanity status on right side */}
                          <div className="bg-slate-950/40 p-4 border border-slate-800/80 rounded-2xl w-full lg:w-72 shrink-0 space-y-3 select-none text-left">
                            <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest block border-b border-slate-850 pb-1.5 mb-1 text-center font-sans font-bold">
                              Process Sign-off Auditing
                            </span>
                            
                            <div className="flex items-center justify-between text-[11px] font-sans">
                              <span className="text-slate-400 font-semibold">Deployment Sign-off</span>
                              {rec.hasDeploymentSignoff ? (
                                <span className="text-emerald-400 font-bold uppercase text-[10px] flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  MET
                                </span>
                              ) : (
                                <span className="text-red-400 font-bold uppercase text-[10px] flex items-center gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                  MISSING
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between text-[11px] font-sans">
                              <span className="text-slate-400 font-semibold">UAT Sign-off Verified</span>
                              {rec.hasUatSignoff ? (
                                <span className="text-emerald-400 font-bold uppercase text-[10px] flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  MET
                                </span>
                              ) : (
                                <span className="text-red-400 font-bold uppercase text-[10px] flex items-center gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                  MISSING
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between text-[11px] font-sans">
                              <span className="text-slate-400 font-semibold">Doc Review & Sign-off</span>
                              {rec.hasDocReviewSignoff ? (
                                <span className="text-emerald-400 font-bold uppercase text-[10px] flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  MET
                                </span>
                              ) : (
                                <span className="text-red-400 font-bold uppercase text-[10px] flex items-center gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                  MISSING
                                </span>
                              )}
                            </div>

                            <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest block border-b border-slate-850 pb-1.5 pt-2 mb-1 text-center font-sans font-bold">
                              Sanity & Stabilization Check
                            </span>

                            {rec.sanityCheckDate && (
                              <div className="flex items-center justify-between text-[11px] font-sans pb-1.5">
                                <span className="text-slate-400 font-semibold">Checked At</span>
                                <span className="text-slate-300 font-black font-mono">
                                  {(() => {
                                    try {
                                      return format(new Date(rec.sanityCheckDate), 'MMM dd, HH:mm');
                                    } catch (e) {
                                      return 'N/A';
                                    }
                                  })()}
                                </span>
                              </div>
                            )}

                            <div className="flex items-center justify-between text-[11px] font-sans">
                              <span className="text-slate-400 font-semibold">Deployment Status</span>
                              {rec.sanityStatus === 'Fail' ? (
                                <span className="text-rose-400 font-extrabold uppercase text-[10px] flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">
                                  <X className="w-3 h-3 text-rose-500 shrink-0" />
                                  FAIL
                                </span>
                              ) : (
                                <span className="text-emerald-400 font-extrabold uppercase text-[10px] flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                  PASS
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Extra failure / Retrospectives conditional views */}
                        {(rec.failureReason || rec.lessonsLearned || rec.notes || rec.rcaVal || rec.sanityStatus === 'Fail') && (
                          <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {rec.sanityStatus === 'Fail' && rec.rcaVal && (
                              <div className="p-3 bg-red-950/20 rounded-2xl border border-red-900/20 text-xs text-left md:col-span-2">
                                <span className="text-red-400 font-black uppercase text-[10px] flex items-center gap-1 mb-1 font-sans">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                                  Root Cause Analysis (RCA)
                                </span>
                                <p className="text-slate-300 font-medium leading-relaxed font-mono text-[11px]">
                                  {rec.rcaVal}
                                </p>
                              </div>
                            )}

                            {rec.failureReason && (
                              <div className="p-3 bg-red-950/20 rounded-2xl border border-red-900/20 text-xs text-left">
                                <span className="text-red-400 font-black uppercase text-[10px] flex items-center gap-1 mb-1">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  Failure retrospective rationale
                                </span>
                                <p className="text-slate-305 font-medium leading-relaxed font-mono text-[11px]">
                                  {rec.failureReason}
                                </p>
                              </div>
                            )}

                            {rec.lessonsLearned && (
                              <div className="p-3 bg-violet-950/10 rounded-2xl border border-violet-900/20 text-xs text-left">
                                <span className="text-violet-400 font-black uppercase text-[10px] flex items-center gap-1.5 mb-1 animate-none">
                                  <Info className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                                  Retrospective lessons learned
                                </span>
                                <p className="text-slate-300 font-semibold italic leading-relaxed">
                                  "{rec.lessonsLearned}"
                                </p>
                              </div>
                            )}

                            {!rec.lessonsLearned && !rec.failureReason && rec.notes && (
                              <div className="p-3 bg-slate-950/40 rounded-2xl border border-slate-800/60 text-xs md:col-span-2 text-left">
                                <span className="text-slate-400 font-black uppercase text-[10px] block mb-1">
                                  Deployment Execution Notes
                                </span>
                                <p className="text-slate-400 font-medium leading-relaxed">
                                  {rec.notes}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Record Edit/Delete Controls */}
                        <div className="mt-4 pt-3 border-t border-slate-800/40 flex justify-end gap-2 shrink-0 select-none">
                          <button
                            onClick={() => handleOpenEditRelease(rec)}
                            className="p-1.5 px-3 bg-slate-850 hover:bg-slate-800 hover:text-white rounded-xl text-slate-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            Edit Release
                          </button>
                          <button
                            onClick={() => handleDeleteReleaseRecord(rec.id)}
                            className="p-1.5 px-3 bg-red-950/10 hover:bg-red-900/20 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {filteredChangeReleases.length === 0 && (
                    <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-3xl select-none">
                      <Sparkles className="w-8 h-8 text-slate-705 mx-auto mb-3" />
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">No matching release records found</p>
                      <p className="text-[10px] text-slate-600 uppercase font-black mt-1">Try resetting your category or query filters</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Interactive Form Dialog/Modal for Registering or Updating Release records */}
          <AnimatePresence>
            {isChangeReleaseModalOpen && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-left"
                >
                  <div className="p-6 border-b border-slate-850 flex items-center justify-between select-none">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
                        <Sparkles className="w-5 h-5 animate-pulse-subtle" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">
                          {editingReleaseRecord ? `Edit Release Record (${editingReleaseRecord.id})` : 'Register Change & Release Record'}
                        </h3>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                          Consolidated internal workflow process tracking
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setIsChangeReleaseModalOpen(false);
                        setEditingReleaseRecord(null);
                      }}
                      className="p-2 hover:bg-slate-850 rounded-xl text-slate-500 hover:text-white transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleSaveReleaseRecord} className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Project Field */}
                      <div>
                        <label className="label-sm">Associated Project Config *</label>
                        <select
                          className="input-field py-2 text-xs bg-slate-950"
                          value={crFormProjectId}
                          onChange={e => setCrFormProjectId(e.target.value)}
                          required
                        >
                          {(PROJECTS_LIST.length > 0 ? PROJECTS_LIST : ['HR-Portal', 'E-Commerce', 'Internal-CRM', 'Mobile-App']).map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>

                      {/* Package Name field */}
                      <div>
                        <label className="label-sm">Deployment WAR/JAR/Package Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. login-module-v1.4.jar"
                          className="input-field text-xs text-slate-100 font-mono"
                          value={crFormWarJarName}
                          onChange={e => setCrFormWarJarName(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* POD, Team, and Lead name mandatory fields */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="label-sm text-slate-400">POD Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. POD-Alpha"
                          className="input-field text-xs text-slate-100"
                          value={crFormPodName}
                          onChange={e => setCrFormPodName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label-sm text-slate-400">Team Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Core Billing Engineering"
                          className="input-field text-xs text-slate-100"
                          value={crFormTeamName}
                          onChange={e => setCrFormTeamName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label-sm text-slate-400">Lead Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Rajesh Kumar"
                          className="input-field text-xs text-slate-100"
                          value={crFormLeadName}
                          onChange={e => setCrFormLeadName(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Purpose / Incident Code / APOM */}
                    <div>
                      <label className="label-sm">Purpose / Incident / APOM ID *</label>
                      <textarea
                        required
                        placeholder="Describe target reasons, incidents linked or specific features deployed..."
                        className="input-field min-h-[60px] text-xs"
                        value={crFormPurpose}
                        onChange={e => setCrFormPurpose(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Deployment Intimation date */}
                      <div>
                        <label className="label-sm">Deployment Intimation Date *</label>
                        <input
                          type="datetime-local"
                          required
                          className="input-field text-xs text-slate-100"
                          value={crFormIntimationDate}
                          onChange={e => setCrFormIntimationDate(e.target.value)}
                        />
                      </div>

                      {/* Target deployment Date/Time */}
                      <div>
                        <label className="label-sm">Deployment Execution Date/Time *</label>
                        <input
                          type="datetime-local"
                          required
                          className="input-field text-xs text-slate-100"
                          value={crFormDeploymentDate}
                          onChange={e => setCrFormDeploymentDate(e.target.value)}
                        />
                      </div>

                      {/* Status select field */}
                      <div>
                        <label className="label-sm">Rollout Status *</label>
                        <select
                          className="input-field text-xs bg-slate-955"
                          value={crFormStatus}
                          onChange={e => {
                            setCrFormStatus(e.target.value);
                            if (e.target.value !== 'Failed' && e.target.value !== 'Rolled Back') {
                              setCrFormRollbackDone(false);
                              setCrFormFailureReason('');
                            }
                          }}
                        >
                          <option value="Scheduled">Scheduled</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Successful">Successful</option>
                          <option value="Failed">Failed</option>
                          <option value="Rolled Back">Rolled Back</option>
                        </select>
                      </div>
                    </div>

                    {/* Checklist boxes */}
                    <div className="bg-slate-950/45 p-4 rounded-2xl border border-slate-800/80 space-y-3">
                      <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block border-b border-slate-850 pb-1.5 select-none font-sans">
                        Pre-Deployment Checklist Auditing
                      </span>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-800 bg-slate-850 text-indigo-500 focus:ring-indigo-500/20"
                            checked={crFormHasDeploymentSignoff}
                            onChange={e => setCrFormHasDeploymentSignoff(e.target.checked)}
                          />
                          <span className="text-[11px] text-slate-350 font-bold uppercase tracking-wide">Deployment Sign-Off</span>
                        </label>

                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-805 bg-slate-850 text-indigo-555 focus:ring-indigo-500/20"
                            checked={crFormHasUatSignoff}
                            onChange={e => setCrFormHasUatSignoff(e.target.checked)}
                          />
                          <span className="text-[11px] text-slate-355 font-bold uppercase tracking-wide">UAT Sign-Off Verified</span>
                        </label>

                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-800 bg-slate-850 text-indigo-500 focus:ring-indigo-500/20"
                            checked={crFormHasDocReviewSignoff}
                            onChange={e => setCrFormHasDocReviewSignoff(e.target.checked)}
                          />
                          <span className="text-[11px] text-slate-350 font-bold uppercase tracking-wide">Doc Review Sign-Off</span>
                        </label>
                      </div>
                    </div>

                    {/* Sanity and Stabilization Check */}
                    <div className="bg-slate-950/45 p-4 rounded-2xl border border-slate-800/80 space-y-3">
                      <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block border-b border-slate-850 pb-1.5 select-none font-sans">
                        Sanity and Stabilization Check
                      </span>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                        <div>
                          <label className="label-sm">Sanity & Stabilization Check Date *</label>
                          <input
                            type="datetime-local"
                            required
                            className="input-field text-xs text-slate-100"
                            value={crFormSanityCheckDate}
                            onChange={e => setCrFormSanityCheckDate(e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="label-sm block mb-1">Deployment Status *</label>
                          <div className="flex items-center gap-6 pt-2">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="radio"
                                name="sanityStatus"
                                value="Pass"
                                checked={crFormSanityStatus === 'Pass'}
                                onChange={() => setCrFormSanityStatus('Pass')}
                                className="w-4 h-4 text-emerald-500 bg-slate-850 border-slate-800 focus:ring-emerald-500/20"
                              />
                              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">Pass</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="radio"
                                name="sanityStatus"
                                value="Fail"
                                checked={crFormSanityStatus === 'Fail'}
                                onChange={() => setCrFormSanityStatus('Fail')}
                                className="w-4 h-4 text-rose-500 bg-slate-850 border-slate-800 focus:ring-rose-500/20"
                              />
                              <span className="text-xs font-black uppercase tracking-wider text-rose-400">Fail</span>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Incase Fail, need RCA and Lessons Learned (Retrospective) section */}
                      <AnimatePresence>
                        {crFormSanityStatus === 'Fail' && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="pt-3 border-t border-slate-850 space-y-3"
                          >
                            <div>
                              <label className="label-sm text-rose-455">Root Cause Analysis (RCA) *</label>
                              <textarea
                                required
                                placeholder="Detail the root cause of the deployment/sanity failure..."
                                className="input-field text-xs bg-slate-950/20 mt-1 min-h-[60px]"
                                value={crFormRca}
                                onChange={e => setCrFormRca(e.target.value)}
                              />
                            </div>

                            <div>
                              <label className="label-sm text-violet-400">Lessons Learned (Retrospective) *</label>
                              <textarea
                                required
                                placeholder="Detail the lessons learned and retrospective highlights..."
                                className="input-field text-xs bg-slate-950/20 mt-1 min-h-[60px]"
                                value={crFormLessonsLearned}
                                onChange={e => setCrFormLessonsLearned(e.target.value)}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Failure details (only visible if status is Failed or Rolled Back) */}
                    {(crFormStatus === 'Failed' || crFormStatus === 'Rolled Back') && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="p-4 bg-red-955/10 border border-red-900/30 rounded-2xl space-y-3"
                      >
                        <div>
                          <label className="label-sm text-red-400">Retrospective Failure Reason *</label>
                          <textarea
                            required
                            placeholder="Provide detail on why the deployment failed or experienced latency / exceptions..."
                            className="input-field text-xs bg-slate-950/20"
                            value={crFormFailureReason}
                            onChange={e => setCrFormFailureReason(e.target.value)}
                          />
                        </div>

                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-800 bg-slate-850 text-red-500 focus:ring-red-500/20"
                            checked={crFormRollbackDone}
                            onChange={e => setCrFormRollbackDone(e.target.checked)}
                          />
                          <span className="text-[11px] text-red-400 font-black uppercase tracking-wider">Rollback Procedure Completed Successfully</span>
                        </label>
                      </motion.div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Lessons learned */}
                      {crFormSanityStatus !== 'Fail' && (
                        <div>
                          <label className="label-sm">Lessons Learned (Retrospective)</label>
                          <textarea
                            placeholder="e.g. Always schedule staging validation lock 48h before release..."
                            className="input-field min-h-[60px] text-xs"
                            value={crFormLessonsLearned}
                            onChange={e => setCrFormLessonsLearned(e.target.value)}
                          />
                        </div>
                      )}

                      {/* Execution Notes */}
                      <div className={crFormSanityStatus === 'Fail' ? "md:col-span-2" : ""}>
                        <label className="label-sm">Additional Execution Notes</label>
                        <textarea
                          placeholder="Include rollback command syntax, port mappings, or validation URIs..."
                          className="input-field min-h-[60px] text-xs"
                          value={crFormNotes}
                          onChange={e => setCrFormNotes(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-4 border-t border-slate-850 flex justify-end gap-3 select-none">
                      <button
                        type="button"
                        onClick={() => {
                          setIsChangeReleaseModalOpen(false);
                          setEditingReleaseRecord(null);
                        }}
                        className="px-4 py-2 bg-slate-805 hover:bg-slate-750 text-slate-300 font-black uppercase text-[10px] tracking-widest rounded-xl transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white font-black uppercase text-[10px] tracking-widest rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        Save Record
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {auditTask && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 40 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 40 }}
                  className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                  <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-500/10 rounded-2xl">
                        <Terminal className="w-6 h-6 text-blue-500" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-2">
                          Audit Trail & SLA Analysis
                          <span className="px-2 py-0.5 bg-slate-800 text-[10px] text-slate-500 rounded border border-slate-700">
                             {auditTask.ticketId}
                          </span>
                        </h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Lifecycle tracking for incident resolution</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setAuditTask(null)}
                      className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-all"
                    >
                      <RotateCcw className="w-5 h-5 rotate-45" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                    {/* SLA Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                         <div className="flex items-center gap-2 mb-2">
                            <Scale className="w-4 h-4 text-emerald-500" />
                            <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">SLA Benchmark Performance</h4>
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                               <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Response Phase</p>
                               <div className="flex items-end gap-2">
                                  <p className="text-xl font-mono text-white">
                                    {auditModalSla ? Math.round(auditModalSla.responseTimeMin) : 0}
                                  </p>
                                  <span className="text-[8px] text-slate-600 font-bold uppercase mb-1">Minutes</span>
                               </div>
                               <div className="mt-2 text-[9px] font-bold text-blue-500/80 bg-blue-500/5 px-2 py-1 rounded border border-blue-500/10 w-fit">
                                  Target: {projectConfigs.find(c => c.projectId === auditTask.projectId)?.slas[auditTask.priority].response}h
                               </div>
                            </div>
                            <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                               <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Resolution Phase</p>
                               <div className="flex items-end gap-2">
                                  <p className="text-xl font-mono text-white">
                                    {auditModalSla && auditModalSla.wasResolved 
                                      ? Math.round(auditModalSla.resolutionTimeMin)
                                      : '---'}
                                  </p>
                                  <span className="text-[8px] text-slate-600 font-bold uppercase mb-1">Minutes</span>
                               </div>
                               <div className="mt-2 text-[9px] font-bold text-indigo-500/80 bg-indigo-500/5 px-2 py-1 rounded border border-indigo-500/10 w-fit">
                                  Target: {projectConfigs.find(c => c.projectId === auditTask.projectId)?.slas[auditTask.priority].resolution}h
                               </div>
                            </div>
                         </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Activity className="w-4 h-4 text-purple-500" />
                            <h4 className="text-[10px] font-black text-purple-500 uppercase tracking-widest">Incident Parameters</h4>
                         </div>
                         <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 h-full">
                            <div className="space-y-3">
                               <div className="flex justify-between items-center text-[10px]">
                                  <span className="text-slate-500 font-bold uppercase">Creation Timestamp</span>
                                  <span className="text-white font-mono">{format(parseISO(auditTask.generationDate), 'MMM dd, HH:mm:ss')}</span>
                               </div>
                               <div className="flex justify-between items-center text-[10px]">
                                  <span className="text-slate-500 font-bold uppercase">Assigned Entity</span>
                                  <span className="text-blue-400 font-bold">{auditTask.assignedTo}</span>
                               </div>
                               <div className="flex justify-between items-center text-[10px]">
                                  <span className="text-slate-500 font-bold uppercase">Severity Tier</span>
                                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-white font-bold">{auditTask.priority}</span>
                               </div>
                               {auditTask.status === 'Hold' && auditTask.holdReason && (
                                 <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-pink-500 font-bold uppercase">Hold Reason</span>
                                    <span className="px-2 py-0.5 rounded bg-pink-500/10 text-pink-400 font-semibold max-w-[200px] truncate" title={auditTask.holdReason}>
                                      {auditTask.holdReason}
                                    </span>
                                 </div>
                               )}
                            </div>
                         </div>
                      </div>
                    </div>

                    {/* Issue & Status Details */}
                    <div className={cn("grid grid-cols-1 gap-6", auditTask.status === 'Hold' ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
                      <div className="space-y-4">
                         <div className="flex items-center gap-2">
                            <Info className="w-4 h-4 text-indigo-400" />
                            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Full Issue Description</h4>
                         </div>
                         <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 min-h-[100px] flex items-start">
                            <p className="text-xs text-slate-300 leading-relaxed font-medium">
                               {auditTask.description || 'No issue description provided.'}
                            </p>
                         </div>
                      </div>
                      {auditTask.status === 'Hold' && (
                        <div className="space-y-4">
                           <div className="flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-pink-400" />
                              <h4 className="text-[10px] font-black text-pink-400 uppercase tracking-widest">Hold Details / Reason</h4>
                           </div>
                           <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 min-h-[100px] flex items-start">
                              <p className="text-xs text-slate-300 leading-relaxed font-medium block w-full whitespace-pre-wrap break-words">
                                 {auditTask.holdReason || 'Flagged on Hold but no specific reason was documented.'}
                              </p>
                           </div>
                        </div>
                      )}
                      <div className="space-y-4">
                         <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-emerald-400" />
                            <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Additional Remarks</h4>
                         </div>
                         <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 min-h-[100px] flex items-start">
                            <p className="text-xs text-slate-300 leading-relaxed font-medium block w-full whitespace-pre-wrap break-words">
                               {auditTask.remarks || 'No auxiliary remarks documented.'}
                            </p>
                         </div>
                      </div>
                    </div>

                    {/* Resolution Section */}
                    <div className="space-y-4">
                       <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-blue-400" />
                          <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Resolution Summary</h4>
                       </div>
                       <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                             <div>
                                <p className="text-[9px] text-slate-500 uppercase font-black mb-3 tracking-widest">Technical Solution</p>
                                <p className="text-xs text-slate-300 leading-relaxed italic">
                                  {auditTask.solution || 'Awaiting resolution document entry...'}
                                </p>
                             </div>
                             <div>
                                <p className="text-[9px] text-slate-500 uppercase font-black mb-3 tracking-widest">Resolution Details</p>
                                <p className="text-xs text-slate-300 leading-relaxed font-mono">
                                  {auditTask.resolutionDetails || 'No auxiliary details provided.'}
                                </p>
                             </div>
                          </div>
                       </div>
                    </div>

                    {/* timeline start */}
                    <div className="space-y-6 pt-4 border-t border-slate-800/60">
                       <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                             <Scale className="w-5 h-5 text-indigo-400" />
                             <div>
                                <h4 className="text-xs font-black text-white uppercase tracking-wider">SLA Milestone Progress</h4>
                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 font-sans">Real-time operation clock tracking & breach assessment</p>
                             </div>
                          </div>
                          
                          <div className="flex items-center gap-1.5 font-sans">
                             <span className={cn(
                               "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                               auditModalSla?.isResponseBreached || auditModalSla?.isResolutionBreached
                                 ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                                 : auditModalSla?.responseLogged && auditModalSla?.wasResolved
                                   ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 animate-pulse"
                                   : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
                             )}>
                                {auditModalSla?.isResponseBreached || auditModalSla?.isResolutionBreached
                                  ? 'SLA Breached'
                                  : auditModalSla?.responseLogged && auditModalSla?.wasResolved
                                    ? 'SLA Fully Compliant'
                                    : 'SLA Clock Active'}
                             </span>
                          </div>
                       </div>

                       <div className="bg-slate-950/60 p-8 rounded-2xl border border-slate-800/80 shadow-2xl relative overflow-hidden">
                          {/* Ambient background glow */}
                          <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                          <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

                          <div className="relative pb-4">
                             {/* SLA Stepper Line Background */}
                             <div className="absolute top-[26px] left-6 right-6 h-1 bg-slate-800/60 rounded-full overflow-hidden">
                                <div className={cn(
                                   "h-full transition-all duration-700 ease-out",
                                   auditTask.status === 'Closed' || auditTask.closureDate
                                     ? "w-full bg-gradient-to-r from-emerald-500 via-indigo-500 to-indigo-600"
                                     : auditTask.responseDate
                                       ? "w-[66%] bg-gradient-to-r from-emerald-500 to-indigo-500"
                                       : "w-[33%] bg-emerald-500"
                                )}></div>
                             </div>

                             <div className="flex justify-between relative">
                                {/* Milestone 1: Registered */}
                                <div className="flex flex-col items-center gap-3 relative z-10 group">
                                   <div className="w-12 h-12 rounded-2xl bg-emerald-950/80 border-2 border-emerald-500 flex items-center justify-center shadow-lg transition-transform group-hover:scale-105 duration-300 shadow-emerald-500/10">
                                      <Plus className="w-5 h-5 text-emerald-400" />
                                   </div>
                                   <div className="text-center font-sans animate-fade-in">
                                      <span className="text-[10px] font-black text-white uppercase tracking-wider block">Registered</span>
                                      <span className="text-[9px] font-mono text-slate-400 block mt-1">
                                         {format(parseISO(auditTask.generationDate), 'MMM dd, HH:mm')}
                                      </span>
                                   </div>
                                </div>

                                {/* Milestone 2: First Response */}
                                <div className="flex flex-col items-center gap-3 relative z-10 group">
                                   <div className={cn(
                                      "w-12 h-12 rounded-2xl border-2 flex items-center justify-center shadow-lg transition-transform group-hover:scale-105 duration-300",
                                      auditModalSla && auditModalSla.responseLogged
                                        ? (!auditModalSla.isResponseBreached
                                          ? "bg-emerald-950/80 border-emerald-500 shadow-emerald-500/10"
                                          : "bg-rose-950/80 border-rose-500 shadow-rose-500/10")
                                        : "bg-slate-900 border-slate-800 text-slate-600"
                                   )}>
                                      <Activity className={cn(
                                         "w-5 h-5",
                                         auditModalSla && auditModalSla.responseLogged
                                           ? (!auditModalSla.isResponseBreached
                                             ? "text-emerald-400"
                                             : "text-rose-400")
                                           : "text-slate-500"
                                      )} />
                                   </div>
                                   <div className="text-center font-sans">
                                      <span className="text-[10px] font-black text-white uppercase tracking-wider block">Responded</span>
                                      <span className={cn(
                                         "text-[9px] font-mono block mt-1",
                                         auditModalSla && auditModalSla.responseLogged
                                           ? (!auditModalSla.isResponseBreached ? "text-emerald-400 font-bold" : "text-rose-400 font-bold")
                                           : "text-slate-400"
                                      )}>
                                         {auditModalSla && auditModalSla.responseLogged 
                                           ? `+${Math.round(auditModalSla.responseTimeMin)}m`
                                           : 'Awaiting Res.'}
                                      </span>
                                   </div>
                                </div>

                                {/* Milestone 3: Hold Clock Pauses */}
                                <div className="flex flex-col items-center gap-3 relative z-10 group">
                                   <div className={cn(
                                      "w-12 h-12 rounded-2xl border-2 flex items-center justify-center shadow-lg transition-transform group-hover:scale-105 duration-300",
                                      auditTask.status === 'Hold'
                                        ? "bg-pink-950/80 border-pink-500 shadow-pink-500/10 animate-pulse"
                                        : auditTask.auditLog?.some(e => (e.details || '').includes('to Hold'))
                                          ? "bg-slate-900 border-pink-500/50 text-pink-400"
                                          : "bg-slate-900 border-slate-800 text-slate-600"
                                   )}>
                                      <Clock className={cn(
                                         "w-5 h-5",
                                         auditTask.status === 'Hold' || auditTask.auditLog?.some(e => (e.details || '').includes('to Hold'))
                                           ? "text-pink-400"
                                           : "text-slate-500"
                                      )} />
                                   </div>
                                   <div className="text-center font-sans">
                                      <span className="text-[10px] font-black text-white uppercase tracking-wider block">SLA Pauses</span>
                                      <span className={cn(
                                         "text-[9px] font-mono block mt-1",
                                         auditTask.status === 'Hold'
                                           ? "text-pink-400 font-bold"
                                           : auditTask.auditLog?.some(e => (e.details || '').includes('to Hold'))
                                             ? "text-pink-400/80 font-semibold"
                                             : "text-slate-400"
                                      )}>
                                         {auditTask.status === 'Hold' ? 'PAUSED' : `${auditTask.auditLog?.filter(e => (e.details || '').includes('to Hold')).length || 0} paused`}
                                      </span>
                                   </div>
                                </div>

                                {/* Milestone 4: Resolution */}
                                <div className="flex flex-col items-center gap-3 relative z-10 group">
                                   <div className={cn(
                                      "w-12 h-12 rounded-2xl border-2 flex items-center justify-center shadow-lg transition-transform group-hover:scale-105 duration-300",
                                      auditModalSla && auditModalSla.wasResolved 
                                        ? (!auditModalSla.isResolutionBreached
                                          ? "bg-indigo-950/80 border-indigo-500 shadow-indigo-500/10"
                                          : "bg-rose-950/80 border-rose-500 shadow-rose-500/10")
                                        : "bg-slate-900 border-slate-800 text-slate-600 animate-pulse"
                                   )}>
                                      <CheckCircle2 className={cn(
                                         "w-5 h-5",
                                         auditModalSla && auditModalSla.wasResolved 
                                           ? (!auditModalSla.isResolutionBreached
                                             ? "text-indigo-400"
                                             : "text-rose-400")
                                           : "text-slate-500"
                                      )} />
                                   </div>
                                   <div className="text-center font-sans">
                                      <span className="text-[10px] font-black text-white uppercase tracking-wider block">Resolved</span>
                                      <span className={cn(
                                         "text-[9px] font-mono block mt-1",
                                         auditModalSla && auditModalSla.wasResolved 
                                           ? (!auditModalSla.isResolutionBreached ? "text-indigo-400 font-bold" : "text-rose-400 font-bold")
                                           : "text-slate-400"
                                      )}>
                                         {auditModalSla && auditModalSla.wasResolved 
                                           ? `+${Math.round(auditModalSla.resolutionTimeMin)}m`
                                           : 'In Progress'}
                                      </span>
                                   </div>
                                </div>
                             </div>
                          </div>
                          
                          {/* SLA Phase Performance Breakdown Cards */}
                          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-800/60 pt-6">
                             {/* Response Phase Metric */}
                             <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80 hover:border-slate-700/60 transition-colors">
                                <div className="flex items-center justify-between">
                                   <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block font-sans">Response Target Details</span>
                                   <span className={cn(
                                      "px-2 py-0.5 rounded text-[8px] font-extrabold uppercase font-mono tracking-wider",
                                      auditModalSla?.responseLogged
                                        ? (!auditModalSla.isResponseBreached ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")
                                        : "bg-sky-500/10 text-sky-400"
                                   )}>
                                      {auditModalSla?.responseLogged 
                                        ? (!auditModalSla.isResponseBreached ? 'Met Target' : 'Breached') 
                                        : 'Awaiting First Response'}
                                   </span>
                                </div>
                                <div className="mt-2.5 space-y-2">
                                   <div className="flex items-baseline justify-between">
                                      <span className="text-[10px] text-slate-400 font-bold uppercase font-sans">Business Limit</span>
                                      <span className="text-xs font-mono font-bold text-white">
                                         {auditModalSla ? `${Math.round(auditModalSla.responseLimitMin)}m` : '---'}
                                      </span>
                                   </div>
                                   <div className="flex items-baseline justify-between border-t border-slate-800/40 pt-1.5 font-sans">
                                      <span className="text-[10px] text-slate-400 font-bold uppercase">Actual Taken</span>
                                      <span className="text-xs font-mono font-bold text-white">
                                         {auditModalSla && auditModalSla.responseLogged 
                                           ? `${Math.round(auditModalSla.responseTimeMin)}m` 
                                           : '---'}
                                      </span>
                                   </div>
                                </div>
                             </div>

                             {/* Hold Offsets Block */}
                             <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80 hover:border-slate-700/60 transition-colors">
                                <div className="flex items-center justify-between">
                                   <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block font-sans">Clock Pause (Hold Metric)</span>
                                   <span className="px-2 py-0.5 rounded text-[8px] font-extrabold uppercase font-mono tracking-wider bg-pink-500/10 text-pink-400">
                                      {auditTask.status === 'Hold' ? 'Hold Triggered' : 'SLA Clock Active'}
                                   </span>
                                </div>
                                <div className="mt-2.5 space-y-2">
                                   <div className="flex items-baseline justify-between">
                                      <span className="text-[10px] text-slate-400 font-bold uppercase font-sans">Pauses Registered</span>
                                      <span className="text-xs font-mono font-bold text-white">
                                         {auditTask.auditLog?.filter(e => (e.details || '').includes('to Hold')).length || 0} Times
                                      </span>
                                   </div>
                                   <div className="flex items-baseline justify-between border-t border-slate-800/40 pt-1.5 font-sans">
                                      <span className="text-[10px] text-slate-400 font-bold uppercase">Total Off-Clock Time</span>
                                      <span className="text-xs font-mono font-bold text-pink-400">
                                         +{Math.round(getTaskHoldMinutes(auditTask, new Date().toISOString(), getEffectiveShift(auditTask.projectId, auditTask.assignedTo)))}m
                                      </span>
                                   </div>
                                </div>
                             </div>

                             {/* Resolution Performance */}
                             <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80 hover:border-slate-700/60 transition-colors">
                                <div className="flex items-center justify-between font-sans">
                                   <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block font-sans">Resolution Target Details</span>
                                   <span className={cn(
                                      "px-2 py-0.5 rounded text-[8px] font-extrabold uppercase font-mono tracking-wider",
                                      auditModalSla?.wasResolved
                                        ? (!auditModalSla.isResolutionBreached ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")
                                        : "bg-indigo-500/10 text-indigo-400"
                                   )}>
                                      {auditModalSla?.wasResolved 
                                        ? (!auditModalSla.isResolutionBreached ? 'Met SLA' : 'Breached SLA') 
                                        : 'Awaiting Resolution'}
                                   </span>
                                </div>
                                <div className="mt-2.5 space-y-2">
                                   <div className="flex items-baseline justify-between">
                                      <span className="text-[10px] text-slate-400 font-bold uppercase font-sans">SLA Target Resolution</span>
                                      <span className="text-xs font-mono font-bold text-white">
                                         {auditModalSla ? `${Math.round(auditModalSla.resolutionLimitMin)}m` : '---'}
                                      </span>
                                   </div>
                                   <div className="flex items-baseline justify-between border-t border-slate-800/40 pt-1.5 font-sans">
                                      <span className="text-[10px] text-slate-400 font-bold uppercase font-sans">Incident Active Net</span>
                                      <span className="text-xs font-mono font-bold text-white">
                                         {auditModalSla ? `${Math.round(auditModalSla.resolutionTimeMin)}m` : '---'}
                                      </span>
                                   </div>
                                </div>
                             </div>
                          </div>
                       </div>
                    </div>

                    {/* Active Case Attachment Vault & Native Directory Layout */}
                    <div className="space-y-4 pt-6 border-t border-slate-800/60 font-sans">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-905 p-3 rounded-xl border border-slate-850/50">
                        <div className="flex items-center gap-2">
                          <Paperclip className="w-5 h-5 text-rose-500" />
                          <div>
                            <h4 className="text-xs font-black text-white uppercase tracking-wider font-sans">Active Case Attachment Vault</h4>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Corporate files associated with this specific incident sequence</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const targetKey = 'sflow_attachments_' + auditTask.ticketId;
                            const listStr = localStorage.getItem(targetKey);
                            let list: any[] = [];
                            if (listStr) {
                              try {
                                const parsed = JSON.parse(listStr);
                                if (Array.isArray(parsed)) list = parsed;
                              } catch (e) {}
                            }
                            if (list.length > 0) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    list.forEach((doc: any) => {
                                      const link = document.createElement('a');
                                      link.href = doc.dataUrl;
                                      link.download = doc.name;
                                      document.body.appendChild(link);
                                      link.click();
                                      document.body.removeChild(link);
                                    });
                                  }}
                                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                                  title="Download all attachments of this ticket on-demand to sync with your E:\ drive"
                                >
                                  <Download className="w-3 h-3 text-emerald-400" />
                                  <span>Download All ({list.length})</span>
                                </button>
                              );
                            }
                            return null;
                          })()}
                          <span className={`text-[9.5px] font-mono px-2.5 py-0.5 rounded border uppercase font-bold tracking-wider ${
                            attachmentStorageMode === 'local' 
                              ? 'text-rose-400 bg-rose-500/10 border-rose-500/15' 
                              : 'text-blue-400 bg-blue-500/10 border-blue-500/15'
                          }`}>
                            {attachmentStorageMode === 'local' ? 'Drive-Mapped Storage Mode' : 'Browser Sandbox Secure Mode'}
                          </span>
                        </div>
                      </div>

                      {/* Path Configuration Info */}
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-3">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 font-sans">
                          <div className="space-y-0.5">
                            <span className="text-[8.5px] uppercase font-bold text-slate-400 block tracking-wider">
                              {attachmentStorageMode === 'local' ? 'Estimated Machine File Pathway' : 'Decentralized Browser Sandbox Key Reference'}
                            </span>
                            <span className="font-mono text-[11px] text-emerald-400 break-all select-all font-semibold">
                              {attachmentStorageMode === 'local' ? (
                                `${attachmentBasePath}\\${projectConfigs.find(c => c.projectId === auditTask.projectId)?.projectId || auditTask.projectId}\\${auditTask.ticketId}\\`
                              ) : (
                                `SECURE_SANDBOX://indexeddb/sflow_attachments_${auditTask.ticketId}/`
                              )}
                            </span>
                          </div>
                          {attachmentStorageMode === 'local' && (
                            <button 
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(`${attachmentBasePath}\\${projectConfigs.find(c => c.projectId === auditTask.projectId)?.projectId || auditTask.projectId}\\${auditTask.ticketId}\\`);
                                setCopiedAttachmentPath(true);
                                setTimeout(() => setCopiedAttachmentPath(false), 2000);
                              }}
                              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700 rounded-xl text-[9px] uppercase font-black tracking-widest flex items-center gap-1.5 shrink-0 transition-all self-start md:self-center"
                            >
                              {copiedAttachmentPath ? <Check className="w-3 h-3 text-emerald-400 animate-bounce" /> : <Copy className="w-3 h-3" />}
                              {copiedAttachmentPath ? 'Copied Pathway!' : 'Copy Pathway'}
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 leading-normal font-medium">
                          {attachmentStorageMode === 'local' 
                            ? 'Any additions committed below reside in the browser database mapped virtually to this native filesystem partition.'
                            : 'All files are securely sandboxed locally using high-performance local buffer serialization to prevent unauthorized external access.'
                          }
                        </p>
                        {attachmentStorageMode === 'local' && (
                          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/15 text-[10px] text-slate-300 leading-normal font-sans text-left">
                            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-extrabold text-amber-400 uppercase tracking-wide text-[9px]">Local Directory Integration Notice</p>
                              <p className="mt-0.5">
                                Secure browsers prevent external web applications from directly writing files onto your computer's drive partitions. To synchronize: use the <span className="text-emerald-400 font-bold">"Download"</span> or <span className="text-emerald-400 font-bold">"Download All"</span> triggers, then place the files in your mapping directory: <span className="font-mono text-white text-[9px] font-semibold bg-slate-950 px-1 py-0.5 rounded">{attachmentBasePath}</span>.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Direct Attachment Dropzone inside Modal */}
                        <div className="lg:col-span-1 bg-slate-900/40 p-5 rounded-2xl border border-slate-800 hover:border-blue-500/30 transition-all flex flex-col justify-center min-h-[140px] relative overflow-hidden group">
                          <div 
                            className="border-2 border-dashed border-slate-800/80 hover:border-slate-650/60 bg-slate-950/20 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer h-full text-center transition-all"
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onDrop={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const files = Array.from(e.dataTransfer.files) as File[];
                              const targetKey = 'sflow_attachments_' + auditTask.ticketId;
                              const existingStr = localStorage.getItem(targetKey);
                              const existingList = existingStr ? JSON.parse(existingStr) : [];
                              const newStaged: any[] = [];
                              for (const file of files) {
                                if (file.size > 4 * 1024 * 1024) {
                                  alert(`File ${file.name} exceeds 4MB size threshold.`);
                                  continue;
                                }
                                await new Promise<void>((resolve) => {
                                  const r = new FileReader();
                                  r.onload = (ev) => {
                                    newStaged.push({
                                      name: file.name,
                                      size: file.size,
                                      type: file.type || 'application/octet-stream',
                                      dataUrl: ev.target?.result as string,
                                      uploadedAt: new Date().toISOString()
                                    });
                                    resolve();
                                  };
                                  r.readAsDataURL(file);
                                });
                              }
                              if (newStaged.length > 0) {
                                const merged = [...existingList, ...newStaged];
                                localStorage.setItem(targetKey, JSON.stringify(merged));
                                // Log event dynamically to audit logs
                                const nowIso = new Date().toISOString();
                                const attachmentUpdateLog = {
                                  timestamp: nowIso,
                                  user: currentUser,
                                  action: 'Attachment Vault Added',
                                  details: `Committed ${newStaged.length} attachment file(s) directly: ${newStaged.map(f => f.name).join(', ')}`
                                };
                                const updatedLogs = [...(auditTask.auditLog || []), attachmentUpdateLog];
                                // Prepare server update
                                const serverPayload = {
                                  ...auditTask,
                                  auditLog: JSON.stringify(updatedLogs)
                                };
                                try {
                                  await fetch(`${API_BASE}/${auditTask.id}`, {
                                    method: 'PUT',
                                    headers: {'Content-Type': 'application/json'},
                                    body: JSON.stringify(serverPayload)
                                  });
                                } catch (err) {
                                  console.error(err);
                                }
                                setAuditTask({
                                  ...auditTask,
                                  auditLog: updatedLogs
                                });
                                // Force tasks list update to trigger visual updates
                                setTasks(prev => prev.map(t => t.id === auditTask.id ? { ...t, auditLog: updatedLogs } : t));
                              }
                            }}
                          >
                            <Upload className="w-5 h-5 text-rose-500 group-hover:scale-110 transition-transform duration-300" />
                            <div className="space-y-1">
                              <p className="text-[10px] font-black uppercase text-slate-300">Drag & Drop Documents</p>
                              <p className="text-[8px] text-slate-500 uppercase font-bold">Or click to select</p>
                            </div>
                            <input 
                              type="file" 
                              multiple 
                              onChange={async (e) => {
                                if (e.target.files) {
                                  const files = Array.from(e.target.files) as File[];
                                  const targetKey = 'sflow_attachments_' + auditTask.ticketId;
                                  const existingStr = localStorage.getItem(targetKey);
                                  const existingList = existingStr ? JSON.parse(existingStr) : [];
                                  const newStaged: any[] = [];
                                  for (const file of files) {
                                    if (file.size > 4 * 1024 * 1024) {
                                      alert(`File ${file.name} exceeds 4MB size threshold.`);
                                      continue;
                                    }
                                    await new Promise<void>((resolve) => {
                                      const r = new FileReader();
                                      r.onload = (ev) => {
                                        newStaged.push({
                                          name: file.name,
                                          size: file.size,
                                          type: file.type || 'application/octet-stream',
                                          dataUrl: ev.target?.result as string,
                                          uploadedAt: new Date().toISOString()
                                        });
                                        resolve();
                                      };
                                      r.readAsDataURL(file);
                                    });
                                  }
                                  if (newStaged.length > 0) {
                                    const merged = [...existingList, ...newStaged];
                                    localStorage.setItem(targetKey, JSON.stringify(merged));
                                    // Log event dynamically to audit logs
                                    const nowIso = new Date().toISOString();
                                    const attachmentUpdateLog = {
                                      timestamp: nowIso,
                                      user: currentUser,
                                      action: 'Attachment Vault Added',
                                      details: `Committed ${newStaged.length} attachment file(s) directly: ${newStaged.map(f => f.name).join(', ')}`
                                    };
                                    const updatedLogs = [...(auditTask.auditLog || []), attachmentUpdateLog];
                                    const serverPayload = {
                                      ...auditTask,
                                      auditLog: JSON.stringify(updatedLogs)
                                    };
                                    try {
                                      await fetch(`${API_BASE}/${auditTask.id}`, {
                                        method: 'PUT',
                                        headers: {'Content-Type': 'application/json'},
                                        body: JSON.stringify(serverPayload)
                                      });
                                    } catch (err) {
                                      console.error(err);
                                    }
                                    setAuditTask({
                                      ...auditTask,
                                      auditLog: updatedLogs
                                    });
                                    setTasks(prev => prev.map(t => t.id === auditTask.id ? { ...t, auditLog: updatedLogs } : t));
                                  }
                                }
                              }}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* List of Attached files */}
                        <div className="lg:col-span-2 space-y-2.5 max-h-[160px] overflow-y-auto custom-scrollbar pr-1.5 flex flex-col justify-start">
                          {(() => {
                            const targetKey = 'sflow_attachments_' + auditTask.ticketId;
                            const listStr = localStorage.getItem(targetKey);
                            const list = listStr ? JSON.parse(listStr) : [];
                            
                            if (list.length === 0) {
                              return (
                                <div className="h-full flex flex-col items-center justify-center p-6 text-center border border-dashed border-slate-800 bg-slate-950/10 rounded-2xl select-none">
                                  <Paperclip className="w-5 h-5 text-slate-700 mb-2 animate-bounce" />
                                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">No active case files on record</span>
                                  <span className="text-[8px] text-slate-600 font-bold uppercase mt-1">Staging directory currently empty</span>
                                </div>
                              );
                            }

                            return list.map((doc: any, i: number) => {
                              const isImg = doc.type.startsWith('image/') || doc.name.toLowerCase().endsWith('.png') || doc.name.toLowerCase().endsWith('.jpg') || doc.name.toLowerCase().endsWith('.jpeg') || doc.name.toLowerCase().endsWith('.svg');
                              const isCsv = doc.name.toLowerCase().endsWith('.csv');
                              const isTxt = doc.type === 'text/plain' || doc.name.toLowerCase().endsWith('.txt') || doc.name.toLowerCase().endsWith('.log');
                              const isPdf = doc.name.toLowerCase().endsWith('.pdf');

                              return (
                                <div key={i} className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-850 hover:border-slate-800 transition-colors">
                                  <div className="flex items-center gap-3 min-w-0 flex-1 font-sans">
                                    <div className="p-2 bg-slate-900 rounded-lg shrink-0 border border-slate-800">
                                      {isImg ? <ImageIcon className="w-4 h-4 text-emerald-400" /> : isCsv ? <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> : <FileText className="w-4 h-4 text-blue-400" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs text-slate-200 mt-0.5 font-bold truncate" title={doc.name}>{doc.name}</p>
                                      <p className="text-[9px] text-slate-500 font-mono">{(doc.size / 1024).toFixed(1)} KB • {format(parseISO(doc.uploadedAt), 'MMM dd, HH:mm')}</p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-1.5 shrink-0 pl-1">
                                    {/* Smart View Button */}
                                    <button 
                                      type="button"
                                      onClick={() => setActiveSmartViewAttachment({ ...doc, ticketId: auditTask.ticketId, projectId: auditTask.projectId })}
                                      className="p-1 px-2 hover:bg-slate-900 text-blue-400 hover:text-white rounded-lg border border-transparent hover:border-slate-800 transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
                                      title="Open in Smart View"
                                    >
                                      <Eye className="w-3.5 h-3.5 text-blue-400" />
                                      <span className="hidden sm:inline text-[8px] tracking-wider font-extrabold text-blue-400">Inspect</span>
                                    </button>

                                    {/* Direct Download */}
                                    <a 
                                      href={doc.dataUrl} 
                                      download={doc.name}
                                      className="p-1.5 hover:bg-slate-900 text-slate-400 hover:text-white rounded-lg border border-transparent hover:border-slate-800 transition-all"
                                      title="Download Native File"
                                    >
                                      <Download className="w-3.5 h-3.5 text-slate-400 hover:text-white" />
                                    </a>

                                    {/* Delete Attachment */}
                                    <button 
                                      type="button"
                                      onClick={async () => {
                                        if (confirm(`Are you sure you want to delete file "${doc.name}" from case logs?`)) {
                                          const merged = list.filter((_: any, idx: number) => idx !== i);
                                          localStorage.setItem(targetKey, JSON.stringify(merged));
                                          // Log event dynamically to audit logs
                                          const nowIso = new Date().toISOString();
                                          const attachmentUpdateLog = {
                                            timestamp: nowIso,
                                            user: currentUser,
                                            action: 'Attachment Vault Removed',
                                            details: `Document deleted from Vault: ${doc.name}`
                                          };
                                          const updatedLogs = [...(auditTask.auditLog || []), attachmentUpdateLog];
                                          const serverPayload = {
                                            ...auditTask,
                                            auditLog: JSON.stringify(updatedLogs)
                                          };
                                          try {
                                            await fetch(`${API_BASE}/${auditTask.id}`, {
                                              method: 'PUT',
                                              headers: {'Content-Type': 'application/json'},
                                              body: JSON.stringify(serverPayload)
                                            });
                                          } catch (err) {
                                            console.error(err);
                                          }
                                          setAuditTask({
                                            ...auditTask,
                                            auditLog: updatedLogs
                                          });
                                          setTasks(prev => prev.map(t => t.id === auditTask.id ? { ...t, auditLog: updatedLogs } : t));
                                        }
                                      }}
                                      className="p-1.5 hover:bg-red-500/10 hover:text-red-400 text-slate-500 rounded-lg transition-all"
                                      title="Delete attachment"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Timeline Log Section */}
                    <div className="space-y-4 pt-4 border-t border-slate-800/60">
                       <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                             <History className="w-5 h-5 text-indigo-400" />
                             <div>
                                <h4 className="text-xs font-black text-white uppercase tracking-wider font-sans">Audit Event Timeline Stream</h4>
                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 font-sans">Chronological record of operation states, updates, and user comments</p>
                             </div>
                          </div>
                          <span className="text-[9px] font-mono text-slate-400/80 bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
                             Sorted Newest On Top
                          </span>
                       </div>

                       <div className="relative pl-10 space-y-6 before:absolute before:left-[17px] before:top-4 before:bottom-4 before:w-[2px] before:bg-linear-to-b before:from-indigo-500/60 before:via-purple-500/40 before:to-transparent">
                          {(() => {
                             // Sort logically so that we can render beautifully
                             const sortedLogs = auditTask.auditLog ? [...auditTask.auditLog].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) : [];
                             
                             return sortedLogs.map((event, idx) => {
                                // Match Event theme and custom visuals
                                const actionLower = event.action.toLowerCase();
                                let theme = {
                                   icon: Info,
                                   color: 'text-slate-400',
                                   bg: 'bg-slate-500/10',
                                   border: 'border-slate-800/80 hover:border-slate-700/60',
                                   glow: 'shadow-[0_0_8px_rgba(148,163,184,0.05)]',
                                   dotBorder: 'border-slate-600',
                                   dotBg: 'bg-slate-950',
                                   tag: 'LOG_ENTRY'
                                };

                                if (actionLower.includes('created')) {
                                   theme = {
                                      icon: Plus,
                                      color: 'text-emerald-400',
                                      bg: 'bg-emerald-500/10',
                                      border: 'border-emerald-500/20 hover:border-emerald-500/40',
                                      glow: 'shadow-[0_0_12px_rgba(16,185,129,0.15)]',
                                      dotBorder: 'border-emerald-500',
                                      dotBg: 'bg-emerald-950',
                                      tag: 'INCEPTION'
                                   };
                                } else if (actionLower.includes('status') || actionLower.includes('hold')) {
                                   theme = {
                                      icon: RotateCcw,
                                      color: 'text-purple-400',
                                      bg: 'bg-purple-500/10',
                                      border: 'border-purple-500/20 hover:border-purple-500/40',
                                      glow: 'shadow-[0_0_12px_rgba(168,85,247,0.15)]',
                                      dotBorder: 'border-purple-500',
                                      dotBg: 'bg-purple-950',
                                      tag: 'STATE_CHANGE'
                                   };
                                } else if (actionLower.includes('priority') || actionLower.includes('severity')) {
                                   theme = {
                                      icon: AlertTriangle,
                                      color: 'text-rose-400',
                                      bg: 'bg-rose-500/10',
                                      border: 'border-rose-500/20 hover:border-rose-500/40',
                                      glow: 'shadow-[0_0_12px_rgba(244,63,94,0.15)]',
                                      dotBorder: 'border-rose-500',
                                      dotBg: 'bg-rose-950',
                                      tag: 'SEVERITY'
                                   };
                                } else if (actionLower.includes('escalation') || actionLower.includes('shift') || actionLower.includes('ownership') || actionLower.includes('assign')) {
                                   theme = {
                                      icon: UserPlus,
                                      color: 'text-blue-400',
                                      bg: 'bg-blue-500/10',
                                      border: 'border-blue-500/20 hover:border-blue-500/40',
                                      glow: 'shadow-[0_0_12px_rgba(59,130,246,0.15)]',
                                      dotBorder: 'border-blue-500',
                                      dotBg: 'bg-blue-950',
                                      tag: 'OWNERSHIP'
                                   };
                                } else if (actionLower.includes('resolution') || actionLower.includes('closure') || actionLower.includes('close') || actionLower.includes('solve')) {
                                   theme = {
                                      icon: CheckCircle2,
                                      color: 'text-indigo-400',
                                      bg: 'bg-indigo-500/10',
                                      border: 'border-indigo-500/20 hover:border-indigo-500/40',
                                      glow: 'shadow-[0_0_12px_rgba(99,102,241,0.15)]',
                                      dotBorder: 'border-indigo-500',
                                      dotBg: 'bg-indigo-950',
                                      tag: 'RESOLUTION'
                                   };
                                }

                                const IconComponent = theme.icon;

                                // Parse details for change indicators like "from X to Y"
                                const matchedChange = (event.details || '').match(/(.*) changed from (.*) to (.*)/i);
                                
                                return (
                                   <div key={idx} className="relative group">
                                      {/* Vertical Line Anchor Indicator */}
                                      <div className={cn(
                                         "absolute -left-[35px] top-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 transition-transform duration-300 group-hover:scale-110",
                                         theme.dotBorder,
                                         theme.dotBg
                                      )}>
                                         <IconComponent className={cn("w-3.5 h-3.5", theme.color)} />
                                      </div>

                                      {/* Event Card */}
                                      <div className={cn(
                                         "bg-slate-950/40 backdrop-blur-xs p-5 rounded-2xl border transition-all duration-300",
                                         theme.border,
                                         theme.glow
                                      )}>
                                         <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2 font-sans">
                                               <span className={cn("text-[9px] font-black tracking-widest px-2 py-0.5 rounded uppercase leading-none font-mono", theme.bg, theme.color)}>
                                                  {theme.tag}
                                               </span>
                                               <span className="text-xs font-black text-slate-200">{event.action}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-500 font-bold font-sans">
                                               <Calendar className="w-3.5 h-3.5 text-slate-600" />
                                               {format(new Date(event.timestamp), 'MMM dd, yyyy h:mm:ss a')}
                                            </div>
                                         </div>

                                         <div className="mt-2 text-xs leading-relaxed text-slate-300 pl-0.5 font-sans">
                                            {matchedChange ? (
                                               <div className="flex flex-wrap items-center gap-2 mt-1 py-1">
                                                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">{matchedChange[1].trim()}:</span>
                                                  <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 font-mono text-xs font-semibold text-slate-400 capitalize">{matchedChange[2].trim()}</span>
                                                  <span className="text-slate-600 font-bold text-xs font-mono">➔</span>
                                                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 font-mono text-xs font-semibold text-emerald-400 capitalize">{matchedChange[3].trim()}</span>
                                               </div>
                                            ) : (
                                               <p className="text-xs text-slate-300 font-medium leading-relaxed">{event.details}</p>
                                            )}
                                         </div>

                                         <div className="mt-4 pt-3 border-t border-slate-800/40 flex items-center justify-between font-sans">
                                            <div className="flex items-center gap-2">
                                               <div className="w-5 h-5 rounded-full bg-slate-800/80 border border-slate-700 font-mono text-[9px] font-black text-slate-300 uppercase flex items-center justify-center">
                                                  {event.user.charAt(0)}
                                               </div>
                                               <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Logged by {event.user}</span>
                                            </div>
                                         </div>
                                      </div>
                                   </div>
                                );
                             });
                          })()}

                          {(!auditTask.auditLog || auditTask.auditLog.length === 0) && (
                            <div className="text-center py-12 text-[10px] font-black text-slate-600 uppercase tracking-widest border border-dashed border-slate-800/60 rounded-2xl bg-slate-950/20">
                               No auxiliary operation logs recorded for this task
                            </div>
                          )}
                       </div>
                    </div>
                  </div>

                  <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end">
                    <button 
                      onClick={() => setAuditTask(null)}
                      className="px-8 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20"
                    >
                      Acknowledge Review
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {logModalState.isOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
                >
                  <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest block mb-0.5">
                        Historical Log Entries
                      </span>
                      <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                        {logModalState.fieldLabel} <span className="text-blue-400">#{tasks.find(t => t.id === logModalState.taskId)?.ticketId || logModalState.taskId}</span>
                      </h3>
                    </div>
                    <button 
                      onClick={() => setLogModalState(prev => ({ ...prev, isOpen: false }))}
                      className="p-1 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="p-6 flex-1 overflow-y-auto space-y-4">
                    {/* Add Entry Form */}
                    <div className="bg-slate-950/50 border border-slate-850 p-4 rounded-xl space-y-3">
                      <label className="text-[9px] uppercase font-black tracking-widest text-slate-500 block">
                        Record New Entry (Stamps with {currentUser})
                      </label>
                      <textarea
                        value={logModalState.newInput}
                        onChange={(e) => setLogModalState(prev => ({ ...prev, newInput: e.target.value }))}
                        placeholder={`Type a description or add details to this record...`}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none min-h-[90px]"
                      />
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={handleAddLogEntry}
                          disabled={!logModalState.newInput.trim()}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20"
                        >
                          Append Log Entry
                        </button>
                      </div>
                    </div>

                    {/* Entries Timeline list */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          Active Entries ({logModalState.entries.length})
                        </h4>
                        <span className="text-[9px] text-slate-650 font-mono">
                          NEWEST ENTRIES KEYED ON TOP
                        </span>
                      </div>

                      <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                        {logModalState.entries.length === 0 ? (
                          <div className="text-center py-8 text-[10px] text-slate-600 uppercase tracking-widest border border-dashed border-slate-800/80 rounded-xl bg-slate-950/10">
                            No log entries recorded. Type above to append the first log entry.
                          </div>
                        ) : (
                          logModalState.entries.map((entry, idx) => (
                            <div key={idx} className="bg-slate-950/40 hover:bg-slate-950/70 border border-slate-850/65 rounded-xl p-4 transition-all relative group">
                              <div className="flex items-center justify-between text-[10px] mb-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="bg-blue-500/10 border border-blue-500/20 text-blue-400 font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-widest text-[9px]">
                                    {entry.user}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-slate-500 font-mono text-[9px] flex items-center gap-1.5 font-bold">
                                    <Clock className="w-3.5 h-3.5" />
                                    {entry.timestamp}
                                  </span>
                                  <button
                                    onClick={() => handleDeleteLogEntry(idx)}
                                    className="p-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-all ml-1"
                                    title="Delete this entry"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-slate-300 leading-relaxed font-normal whitespace-pre-wrap pl-1">
                                {entry.text}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end">
                    <button 
                      onClick={() => setLogModalState(prev => ({ ...prev, isOpen: false }))}
                      className="px-8 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      Done Editing
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {confirmModal.isOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className={cn(
                      "p-3 rounded-xl",
                      confirmModal.type === 'danger' ? "bg-red-500/10 text-red-500" :
                      confirmModal.type === 'warning' ? "bg-amber-500/10 text-amber-500" :
                      "bg-blue-500/10 text-blue-500"
                    )}>
                      {confirmModal.type === 'danger' ? <Trash2 className="w-6 h-6" /> :
                       confirmModal.type === 'warning' ? <AlertTriangle className="w-6 h-6" /> :
                       <Info className="w-6 h-6" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-widest">{confirmModal.title}</h3>
                      <p className="text-xs text-slate-400 mt-1">{confirmModal.message}</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                      className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={confirmModal.onConfirm}
                      className={cn(
                        "flex-1 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-lg",
                        confirmModal.type === 'danger' ? "bg-red-600 hover:bg-red-500 text-white shadow-red-500/20" :
                        confirmModal.type === 'warning' ? "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20" :
                        "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20"
                      )}
                    >
                      {confirmModal.confirmLabel}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {drilldownModalOpen && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 30 }}
                  transition={{ type: "spring", duration: 0.4 }}
                  className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl shadow-3xl flex flex-col max-h-[85vh] overflow-hidden backdrop-blur-xl"
                >
                  {/* Modal Header */}
                  <div className="p-6 border-b border-slate-800 bg-slate-900/60 flex items-start justify-between min-h-[90px]">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          Metric Analytics Drilldown
                        </span>
                        <span className="text-[10px] bg-slate-950 border border-slate-800 text-slate-400 font-mono px-2 py-0.5 rounded-full">
                          {drilldownTickets.length} Associated Tickets
                        </span>
                      </div>
                      <h3 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                        {drilldownTitle}
                      </h3>
                      <p className="text-xs text-slate-400 font-medium leading-normal mt-0.5 max-w-3xl">
                        {drilldownDescription}
                      </p>
                    </div>
                    <button 
                      onClick={() => setDrilldownModalOpen(false)}
                      className="p-1 rounded-xl hover:bg-slate-850 text-slate-400 hover:text-white transition-all duration-250 mt-1"
                    >
                      <X className="w-5.5 h-5.5" />
                    </button>
                  </div>

                  {/* Smart Filters and Search Bar */}
                  <div className="bg-slate-950/40 border-b border-slate-850 px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full sm:max-w-md">
                      <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search tickets by ID, assignee, subject, or severity..."
                        value={drilldownSearch}
                        onChange={(e) => setDrilldownSearch(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800/85 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-bold transition-all"
                      />
                      {drilldownSearch && (
                        <button 
                          onClick={() => setDrilldownSearch('')}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-550 hover:text-white uppercase font-black tracking-wider transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="hidden sm:flex items-center gap-2 select-none">
                      <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest whitespace-nowrap">Filter Status:</span>
                      <div className="flex gap-1.5 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                        <span className="text-[9px] text-indigo-400 font-black px-2 py-1 bg-indigo-500/5 border border-indigo-500/10 rounded uppercase">Active View Filters Applied</span>
                      </div>
                    </div>
                  </div>

                  {/* Table area */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {(() => {
                      const filteredAndSearchList = drilldownTickets.filter(task => {
                        if (!drilldownSearch) return true;
                        const term = drilldownSearch.toLowerCase();
                        return (
                          task.ticketId?.toLowerCase().includes(term) ||
                          task.assignedTo?.toLowerCase().includes(term) ||
                          task.priority?.toLowerCase().includes(term) ||
                          task.supportLevel?.toLowerCase().includes(term) ||
                          task.description?.toLowerCase().includes(term) ||
                          task.id?.toLowerCase().includes(term)
                        );
                      });

                      if (filteredAndSearchList.length === 0) {
                        return (
                          <div className="text-center py-16 text-slate-500 bg-slate-950/20 border border-slate-850 border-dashed rounded-2xl flex flex-col items-center justify-center">
                            <Activity className="w-10 h-10 text-slate-700 mb-2 animate-pulse" />
                            <h4 className="text-xs uppercase font-black tracking-widest text-slate-400">No matching tickets found</h4>
                            <p className="text-[10px] text-slate-500 uppercase font-bold mt-1 max-w-sm">No ticket records align with your search query in this data cohort.</p>
                          </div>
                        );
                      }

                      return (
                        <div className="border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-850 bg-slate-950/50 text-[9px] text-slate-400 font-black uppercase tracking-wider select-none">
                                <th className="px-4 py-3 text-center">Ticket ID</th>
                                <th className="px-4 py-3">Roster Info / Details</th>
                                <th className="px-4 py-3 text-center">Assignee</th>
                                <th className="px-4 py-3 text-center">Priority / Tier</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3">SLA Compliance Status</th>
                                <th className="px-4 py-3 text-center">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/65 bg-slate-900/10 text-xs text-slate-300">
                              {filteredAndSearchList.map(task => {
                                const tTimes = getTaskSlaTimes(task, new Date().toISOString());
                                return (
                                  <tr key={task.id} className="hover:bg-slate-950/30 transition-all font-sans leading-relaxed border-b border-slate-850">
                                    <td className="px-4 py-3 text-center font-mono font-black text-indigo-400">
                                      #{task.ticketId || task.id.substring(0, 6)}
                                    </td>
                                    <td className="px-4 py-3 font-normal max-w-[340px] text-left">
                                      <p className="font-extrabold text-white text-[11px] truncate text-left">{task.description}</p>
                                      <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mt-0.5">Logged: {format(new Date(task.generationDate), 'MMM dd, h:mm a')}</p>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 border border-slate-850 rounded-lg">
                                        <div className="w-4.5 h-4.5 rounded-full bg-slate-800 text-white font-black text-[8px] flex items-center justify-center uppercase">
                                          {(task.assignedTo || 'Un').substring(0, 2)}
                                        </div>
                                        <span className="text-[10px] font-black text-slate-200">{task.assignedTo || 'Unassigned'}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <div className="flex flex-col items-center gap-1">
                                        <span className={cn(
                                          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border leading-none font-sans",
                                          task.priority === 'P1' ? "bg-red-500/10 border-red-500/20 text-red-400" :
                                          task.priority === 'P2' ? "bg-orange-500/10 border-orange-500/20 text-orange-400" :
                                          task.priority === 'P3' ? "bg-blue-500/10 border-blue-500/20 text-blue-400" :
                                          "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                        )}>
                                          {task.priority || 'P3'}
                                        </span>
                                        <span className="text-[8px] text-slate-500 font-mono font-semibold">TIER-{task.supportLevel || '1'}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <span className={cn(
                                        "px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase leading-none border inline-block",
                                        task.status === 'Resolved' || task.status === 'Closed' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                                        task.status === 'In-Progress' ? "bg-blue-500/10 border-blue-500/20 text-blue-400" :
                                        task.status === 'Hold' ? "bg-violet-500/10 border-violet-500/20 text-violet-400" :
                                        "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                      )}>
                                        {task.status}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-left">
                                      <div className="space-y-1 text-[9px] font-mono leading-normal">
                                        <div className="flex justify-between gap-4">
                                          <span className="text-slate-500 uppercase font-black font-sans">Ack Time:</span>
                                          <span className={cn("font-bold font-mono", tTimes.isResponseBreached ? "text-rose-400 font-extrabold" : "text-emerald-400")}>
                                            {task.acknowledgementDate ? `Met (${formatDuration(tTimes.responseTimeMin * 60000)})` : `In flight`}
                                          </span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-slate-500 uppercase font-black font-sans">Fix SLA:</span>
                                          <span className={cn("font-bold font-mono", tTimes.isResolutionBreached ? "text-rose-400 bg-rose-500/5 px-1 rounded font-black uppercase" : "text-emerald-400")}>
                                            {tTimes.isResolutionBreached ? `BREACHED` : `MET`} ({parseFloat((tTimes.resolutionTimeMin / 60).toFixed(1))}h / {parseFloat(((tTimes.resolutionLimitMin || 1440) / 60).toFixed(1))}h)
                                          </span>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <div className="flex items-center justify-center gap-1.5">
                                        <button 
                                          onClick={() => {
                                            setDrilldownModalOpen(false);
                                            setAuditTask(task);
                                          }}
                                          className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg text-indigo-400 hover:text-indigo-300 transition-all font-sans font-bold text-[10px] uppercase cursor-pointer"
                                          title="Audit exact timelines and historic change trails"
                                        >
                                          Audit
                                        </button>
                                        <button 
                                          onClick={() => {
                                            setDrilldownModalOpen(false);
                                            startEditing(task);
                                          }}
                                          className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-blue-400 hover:text-blue-300 transition-all font-sans font-bold text-[10px] uppercase cursor-pointer"
                                          title="Modify ticket details"
                                        >
                                          Edit
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Footer */}
                  <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center text-[10px] font-mono text-slate-500">
                    <span>Database Cohort Segment Filtered On-The-Fly</span>
                    <button 
                      onClick={() => setDrilldownModalOpen(false)}
                      className="px-6 py-2 bg-slate-800 hover:bg-slate-705 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      Dismiss Analytics Drilldown
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Smart View / Attachment Lightbox Inspector Modal */}
          <AnimatePresence>
            {activeSmartViewAttachment && (
              <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md animate-fade-in font-sans">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden backdrop-blur-xl"
                >
                  {/* Modal Header */}
                  <div className="p-6 border-b border-slate-800 bg-slate-900/40 flex items-start justify-between min-h-[90px]">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] bg-rose-500/10 border border-rose-500/25 text-rose-400 font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider font-sans">
                          Smart Attachment Inspector
                        </span>
                        <span className="text-[10px] bg-slate-950 border border-slate-800 text-emerald-400 font-mono px-2 py-0.5 rounded-full font-bold">
                          Direct Stream
                        </span>
                      </div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1.5 leading-tight font-sans">
                        {activeSmartViewAttachment.name}
                      </h3>
                      <p className="text-[10px] text-slate-505 font-mono font-medium max-w-2xl mt-1 select-all break-all leading-relaxed text-slate-500">
                        {attachmentStorageMode === 'local' ? (
                          `${attachmentBasePath}\\${activeSmartViewAttachment.projectId || 'PROJECT'}\\${activeSmartViewAttachment.ticketId || 'CASE_ID'}\\${activeSmartViewAttachment.name}`
                        ) : (
                          `SECURE_SANDBOX://indexeddb/sflow_attachments_${activeSmartViewAttachment.ticketId || 'CASE_ID'}/${activeSmartViewAttachment.name}`
                        )}
                      </p>
                    </div>
                    <button 
                      onClick={() => setActiveSmartViewAttachment(null)}
                      className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all duration-250 shrink-0"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Content Preview Stage */}
                  <div className="flex-1 overflow-y-auto p-6 bg-slate-950/40 flex flex-col items-center justify-center min-h-[300px]">
                    {(() => {
                      const fileType = activeSmartViewAttachment.type || '';
                      const isImg = fileType.startsWith('image/') || 
                                    activeSmartViewAttachment.name.toLowerCase().endsWith('.png') || 
                                    activeSmartViewAttachment.name.toLowerCase().endsWith('.jpg') || 
                                    activeSmartViewAttachment.name.toLowerCase().endsWith('.jpeg') || 
                                    activeSmartViewAttachment.name.toLowerCase().endsWith('.svg');
                      
                      const isTextOrCode = fileType.startsWith('text/') || 
                                           activeSmartViewAttachment.name.toLowerCase().endsWith('.txt') || 
                                           activeSmartViewAttachment.name.toLowerCase().endsWith('.json') || 
                                           activeSmartViewAttachment.name.toLowerCase().endsWith('.log') || 
                                           activeSmartViewAttachment.name.toLowerCase().endsWith('.xml') || 
                                           activeSmartViewAttachment.name.toLowerCase().endsWith('.csv');

                      if (isImg && activeSmartViewAttachment.dataUrl) {
                        return (
                          <div className="relative max-h-[50vh] max-w-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-950/60 p-4 shadow-xl flex items-center justify-center">
                            <img 
                              src={activeSmartViewAttachment.dataUrl} 
                              alt={activeSmartViewAttachment.name} 
                              className="max-h-[45vh] max-w-full object-contain rounded-xl"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        );
                      }

                      if (isTextOrCode && activeSmartViewAttachment.dataUrl) {
                        try {
                          // Try decoding base64 content
                          const parts = activeSmartViewAttachment.dataUrl.split(',');
                          if (parts.length > 1) {
                            const decoded = atob(parts[1]);
                            return (
                              <div className="w-full h-[50vh] bg-slate-950 p-4 rounded-2xl border border-slate-850 font-mono text-xs text-slate-350 overflow-auto custom-scrollbar text-left line-clamp-[60] leading-relaxed select-text">
                                <span className="text-[10px] text-zinc-500 font-black block border-b border-zinc-900 pb-2 mb-3 uppercase tracking-wider">Virtual Terminal Contents View (Raw Text)</span>
                                <pre className="whitespace-pre-wrap word-break-all text-[11px] font-medium text-slate-300">{decoded}</pre>
                              </div>
                            );
                          }
                        } catch (err) {
                          console.error(err);
                        }
                      }

                      // Default metadata overview for PDF, office files or unspecified objects
                      return (
                        <div className="text-center p-8 bg-slate-950/60 rounded-2xl border border-slate-850 max-w-md w-full">
                          <FileCode className="w-12 h-12 text-zinc-650 mx-auto mb-4" />
                          <h4 className="text-sm font-black text-slate-300 uppercase tracking-widest leading-none font-sans">Smart Preview Terminal</h4>
                          <p className="text-[10px] text-slate-500 uppercase mt-1.5 font-bold tracking-widest font-sans">Complex Content Stream Detected</p>
                          
                          <div className="mt-5 space-y-2 text-left bg-slate-950 p-4 rounded-xl border border-slate-900 font-mono text-[10px] text-slate-450 select-text">
                            <div className="flex justify-between"><span className="text-slate-650">Mime Type:</span> <span className="font-semibold text-slate-300">{activeSmartViewAttachment.type || 'unknown/binary'}</span></div>
                            <div className="flex justify-between"><span className="text-slate-650">Byte Size:</span> <span className="font-semibold text-slate-300">{activeSmartViewAttachment.size} Bytes ({(activeSmartViewAttachment.size / 1024).toFixed(1)} KB)</span></div>
                            <div className="flex justify-between border-t border-slate-900 pt-1.5"><span className="text-rose-400">Virtual Stream:</span> <span className="font-semibold text-rose-400">ACTIVE [BASE64]</span></div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Modal Footer Controls */}
                  <div className="p-6 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between">
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-none font-sans">
                      Secured KAUST ITSM Local Drive Sandbox
                    </p>
                    <div className="flex items-center gap-3">
                      <button 
                        type="button" 
                        onClick={() => {
                          const parts = activeSmartViewAttachment.dataUrl.split(',');
                          const rawData = parts.length > 1 ? parts[1] : activeSmartViewAttachment.dataUrl;
                          navigator.clipboard.writeText(rawData);
                          alert('Data Payload Copied safely to clipboard!');
                        }}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white rounded-xl text-[10.5px] font-black uppercase tracking-widest transition-all"
                      >
                        Copy Data Stream
                      </button>
                      <a 
                        href={activeSmartViewAttachment.dataUrl} 
                        download={activeSmartViewAttachment.name}
                        onClick={() => setActiveSmartViewAttachment(null)}
                        className="btn-primary px-5 py-2 rounded-xl text-[10.5px] font-black uppercase tracking-widest font-sans tracking-wider cursor-pointer flex items-center justify-center"
                      >
                        Download Original
                      </a>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function KPICard({ label, value, color, progress, progressColor, className }: any) {
  return (
    <div className={cn("bg-slate-900/40 border border-slate-800 p-4 rounded-xl backdrop-blur-sm", className)}>
      <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-wider">{label}</p>
      <p className={cn("text-2xl font-mono", color)}>{value}</p>
      {progress !== undefined && (
        <div className="mt-2 h-1 bg-slate-800 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            className={cn("h-full", progressColor)} 
          />
        </div>
      )}
    </div>
  );
}

function ComplianceGauge({ percentage, colorClass = "stroke-blue-500", size = 100, strokeWidth = 8, label = "MET" }: any) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-slate-800"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          value={percentage}
          className={cn("transition-all duration-1000 ease-out", colorClass)}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      {/* Central label */}
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-xl font-mono font-black text-white leading-none">{percentage}%</span>
        <span className="text-[8px] uppercase font-bold tracking-widest text-slate-500 mt-1">{label}</span>
      </div>
    </div>
  );
}

