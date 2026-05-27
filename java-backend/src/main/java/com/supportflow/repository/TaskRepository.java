package com.supportflow.repository;

import com.supportflow.entity.SupportTask;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface TaskRepository extends JpaRepository<SupportTask, Long> {
    List<SupportTask> findByProjectId(String projectId);
    List<SupportTask> findByStatus(String status);
}
