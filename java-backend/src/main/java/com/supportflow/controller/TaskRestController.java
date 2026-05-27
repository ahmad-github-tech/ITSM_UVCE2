package com.supportflow.controller;

import com.supportflow.entity.SupportTask;
import com.supportflow.service.TaskService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/tasks")
@CrossOrigin(origins = "http://localhost:3000") // Allow React dev server
public class TaskRestController {

    @Autowired
    private TaskService taskService;

    @GetMapping
    public List<SupportTask> getAllTasks() {
        return taskService.getAllTasks();
    }

    @GetMapping("/{id}")
    public ResponseEntity<SupportTask> getTaskById(@PathVariable Long id) {
        return taskService.getTaskById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public SupportTask createTask(@RequestBody SupportTask task) {
        return taskService.saveTask(task);
    }

    @PutMapping("/{id}")
    public ResponseEntity<SupportTask> updateTask(@PathVariable Long id, @RequestBody SupportTask taskDetails) {
        return taskService.getTaskById(id)
                .map(task -> {
                    task.setTicketId(taskDetails.getTicketId());
                    task.setProjectId(taskDetails.getProjectId());
                    task.setSupportLevel(taskDetails.getSupportLevel());
                    task.setPriority(taskDetails.getPriority());
                    task.setGenerationDate(taskDetails.getGenerationDate());
                    task.setResponseDate(taskDetails.getResponseDate());
                    task.setClosureDate(taskDetails.getClosureDate());
                    task.setStatus(taskDetails.getStatus());
                    task.setUserIntimated(taskDetails.isUserIntimated());
                    task.setDescription(taskDetails.getDescription());
                    task.setSolution(taskDetails.getSolution());
                    task.setRemarks(taskDetails.getRemarks());
                    task.setAssignedTo(taskDetails.getAssignedTo());
                    task.setHoldReason(taskDetails.getHoldReason());
                    task.setCategory(taskDetails.getCategory());
                    task.setSubcategory(taskDetails.getSubcategory());
                    task.setAuditLog(taskDetails.getAuditLog());
                    return ResponseEntity.ok(taskService.saveTask(task));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTask(@PathVariable Long id) {
        return taskService.getTaskById(id)
                .map(task -> {
                    taskService.deleteTask(id);
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }
}
