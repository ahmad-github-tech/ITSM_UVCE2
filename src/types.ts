/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SupportLevel = 'L1' | 'L2' | 'L3' | 'L4';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type TaskStatus = 'Open' | 'In-Progress' | 'Hold' | 'Resolved' | 'Closed';

export interface AuditEvent {
  timestamp: string;
  user: string;
  action: string;
  details?: string;
}

export interface SupportTask {
  id: number; // Database ID
  ticketId: string; // Human readable ID (e.g. INC-1001)
  projectId: string;
  supportLevel: SupportLevel;
  priority: Priority;
  generationDate: string;
  responseDate: string;
  closureDate: string | null;
  status: TaskStatus;
  userIntimated: boolean;
  description: string;
  solution: string;
  remarks: string;
  assignedTo: string;
  createdBy?: string;
  resolutionDetails?: string;
  holdReason?: string;
  category?: string;
  subcategory?: string;
  auditLog: AuditEvent[];
}

export const PRIORITY_COLORS = {
  P1: '#ef4444', // Red
  P2: '#f97316', // Orange
  P3: '#3b82f6', // Blue
  P4: '#22c55e', // Green
};

export const STATUS_COLORS = {
  Open: '#94a3b8',
  'In-Progress': '#f59e0b',
  Hold: '#ec4899', // Pinkish/Magenta for Hold
  Resolved: '#10b981',
  Closed: '#6366f1',
};

export interface SLAThresholds {
  response: number; // in hours
  resolution: number; // in hours
}

export interface EmployeeShift {
  name: string;
  shiftStart: string;
  shiftEnd: string;
  workingDays: string[];
}

export interface ProjectConfig {
  projectId: string;
  employees: string[];
  slas: {
    [key in Priority]: SLAThresholds;
  };
  shiftStart: string;
  shiftEnd: string;
  workingDays: string[];
  holidays: string[];
  employeeShifts: EmployeeShift[];
}

export interface AppUser {
  id: string; // User ID
  name: string;
  password?: string;
  status: 'Active' | 'Inactive';
  role: string;
  recoveryQuestion?: string;
  recoveryAnswer?: string;
}
