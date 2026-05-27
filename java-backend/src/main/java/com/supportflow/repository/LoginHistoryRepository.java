package com.supportflow.repository;

import com.supportflow.entity.LoginHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface LoginHistoryRepository extends JpaRepository<LoginHistory, Long> {
    List<LoginHistory> findByUserIdOrderByLoginTimeDesc(String userId);
    List<LoginHistory> findFirst10ByOrderByLoginTimeDesc();
}
