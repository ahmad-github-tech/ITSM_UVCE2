package com.supportflow.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "login_histories")
public class LoginHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String userId;

    private String name;

    private LocalDateTime loginTime;

    private String clientInfo;

    private String status;

    public LoginHistory() {}

    public LoginHistory(String userId, String name, LocalDateTime loginTime, String clientInfo, String status) {
        this.userId = userId;
        this.name = name;
        this.loginTime = loginTime;
        this.clientInfo = clientInfo;
        this.status = status;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public LocalDateTime getLoginTime() { return loginTime; }
    public void setLoginTime(LocalDateTime loginTime) { this.loginTime = loginTime; }

    public String getClientInfo() { return clientInfo; }
    public void setClientInfo(String clientInfo) { this.clientInfo = clientInfo; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
