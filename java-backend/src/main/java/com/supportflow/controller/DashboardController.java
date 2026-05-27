package com.supportflow.controller;

import com.supportflow.entity.SupportTask;
import com.supportflow.repository.TaskRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import java.util.List;

@Controller
public class DashboardController {

    @Autowired
    private TaskRepository taskRepository;

    @GetMapping("/")
    public String index(Model model) {
        List<SupportTask> tasks = taskRepository.findAll();
        model.addAttribute("tasks", tasks);
        // Add stats for analytics
        model.addAttribute("totalTasks", tasks.size());
        model.addAttribute("activeTasks", tasks.stream().filter(t -> !t.getStatus().equals("Closed")).count());
        return "dashboard";
    }

    @GetMapping("/login")
    public String login() {
        return "login";
    }

    @GetMapping("/tasks")
    public String listTasks(Model model) {
        model.addAttribute("tasks", taskRepository.findAll());
        return "tasks";
    }
}
