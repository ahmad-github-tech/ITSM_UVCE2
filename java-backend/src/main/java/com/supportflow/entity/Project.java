package com.supportflow.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "projects")
public class Project {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String name;

    private String description;

    // SLA thresholds in hours
    private int p1ResponseSla = 2;
    private int p1ResolutionSla = 4;
    private int p2ResponseSla = 4;
    private int p2ResolutionSla = 8;
    private int p3ResponseSla = 8;
    private int p3ResolutionSla = 24;
    private int p4ResponseSla = 24;
    private int p4ResolutionSla = 48;

    @Column(columnDefinition = "TEXT")
    private String employees; // Comma separated list of employee names

    private String shiftStart = "09:00";
    private String shiftEnd = "18:00";
    private String workingDays = "Mon,Tue,Wed,Thu,Fri";
    @Column(columnDefinition = "TEXT")
    private String holidays = "";
    @Column(columnDefinition = "TEXT")
    private String employeeShifts = "[]";

    public Project() {}

    public Project(String name) {
        this.name = name;
        this.employees = "John.D, Sarah.M, Admin, Support.Alpha"; // Default sample
        this.shiftStart = "09:00";
        this.shiftEnd = "18:00";
        this.workingDays = "Mon,Tue,Wed,Thu,Fri";
        this.holidays = "";
        this.employeeShifts = "[]";
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public int getP1ResponseSla() { return p1ResponseSla; }
    public void setP1ResponseSla(int p1ResponseSla) { this.p1ResponseSla = p1ResponseSla; }

    public int getP1ResolutionSla() { return p1ResolutionSla; }
    public void setP1ResolutionSla(int p1ResolutionSla) { this.p1ResolutionSla = p1ResolutionSla; }

    public int getP2ResponseSla() { return p2ResponseSla; }
    public void setP2ResponseSla(int p2ResponseSla) { this.p2ResponseSla = p2ResponseSla; }

    public int getP2ResolutionSla() { return p2ResolutionSla; }
    public void setP2ResolutionSla(int p2ResolutionSla) { this.p2ResolutionSla = p2ResolutionSla; }

    public int getP3ResponseSla() { return p3ResponseSla; }
    public void setP3ResponseSla(int p3ResponseSla) { this.p3ResponseSla = p3ResponseSla; }

    public int getP3ResolutionSla() { return p3ResolutionSla; }
    public void setP3ResolutionSla(int p3ResolutionSla) { this.p3ResolutionSla = p3ResolutionSla; }

    public int getP4ResponseSla() { return p4ResponseSla; }
    public void setP4ResponseSla(int p4ResponseSla) { this.p4ResponseSla = p4ResponseSla; }

    public int getP4ResolutionSla() { return p4ResolutionSla; }
    public void setP4ResolutionSla(int p4ResolutionSla) { this.p4ResolutionSla = p4ResolutionSla; }

    public String getEmployees() { return employees; }
    public void setEmployees(String employees) { this.employees = employees; }

    public String getShiftStart() { return shiftStart; }
    public void setShiftStart(String shiftStart) { this.shiftStart = shiftStart; }

    public String getShiftEnd() { return shiftEnd; }
    public void setShiftEnd(String shiftEnd) { this.shiftEnd = shiftEnd; }

    public String getWorkingDays() { return workingDays; }
    public void setWorkingDays(String workingDays) { this.workingDays = workingDays; }

    public String getHolidays() { return holidays; }
    public void setHolidays(String holidays) { this.holidays = holidays; }

    public String getEmployeeShifts() { return employeeShifts; }
    public void setEmployeeShifts(String employeeShifts) { this.employeeShifts = employeeShifts; }
}
