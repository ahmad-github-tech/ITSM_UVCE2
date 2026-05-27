package com.supportflow.service;

import com.supportflow.entity.SupportTask;
import com.supportflow.repository.TaskRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;

@Service
public class TaskService {

    @Autowired
    private TaskRepository taskRepository;

    public List<SupportTask> getAllTasks() {
        return taskRepository.findAll();
    }

    public Optional<SupportTask> getTaskById(Long id) {
        return taskRepository.findById(id);
    }

    public SupportTask saveTask(SupportTask task) {
        return taskRepository.save(task);
    }

    public void deleteTask(Long id) {
        taskRepository.deleteById(id);
    }

    public List<SupportTask> getTasksByProject(String projectId) {
        return taskRepository.findByProjectId(projectId);
    }
}
