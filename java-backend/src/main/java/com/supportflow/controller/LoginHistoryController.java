package com.supportflow.controller;

import com.supportflow.entity.LoginHistory;
import com.supportflow.repository.LoginHistoryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/login-histories")
@CrossOrigin(origins = "*")
public class LoginHistoryController {

    @Autowired
    private LoginHistoryRepository loginHistoryRepository;

    @GetMapping
    public List<LoginHistory> getAllLoginHistories() {
        return loginHistoryRepository.findFirst10ByOrderByLoginTimeDesc();
    }

    @GetMapping("/user/{userId}")
    public List<LoginHistory> getUserHistories(@PathVariable String userId) {
        return loginHistoryRepository.findByUserIdOrderByLoginTimeDesc(userId);
    }

    @PostMapping
    public LoginHistory recordLogin(@RequestBody LoginHistory loginHistory) {
        if (loginHistory.getLoginTime() == null) {
            loginHistory.setLoginTime(LocalDateTime.now());
        }
        return loginHistoryRepository.save(loginHistory);
    }
}
