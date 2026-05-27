package com.supportflow.config;

import com.supportflow.entity.Project;
import com.supportflow.entity.SupportTask;
import com.supportflow.entity.User;
import com.supportflow.entity.CategoryMapping;
import com.supportflow.repository.ProjectRepository;
import com.supportflow.repository.TaskRepository;
import com.supportflow.repository.UserRepository;
import com.supportflow.repository.CategoryMappingRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

@Configuration
public class DataInitializer {

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private CategoryMappingRepository categoryMappingRepository;

    @Bean
    public CommandLineRunner initData() {
        return args -> {
            if (categoryMappingRepository.count() == 0) {
                System.out.println("Initializing sample categories and subcategories...");
                List<CategoryMapping> mappings = Arrays.asList(
                    // Incident
                    new CategoryMapping("Incident", "Application Issue"),
                    new CategoryMapping("Incident", "Production Issue"),
                    new CategoryMapping("Incident", "Infrastructure Issue"),
                    new CategoryMapping("Incident", "Service Failure"),
                    // Request
                    new CategoryMapping("Request", "Access Request"),
                    new CategoryMapping("Request", "Software Request"),
                    new CategoryMapping("Request", "Hardware Request"),
                    new CategoryMapping("Request", "Support Request"),
                    // Change
                    new CategoryMapping("Change", "Deployment"),
                    new CategoryMapping("Change", "Configuration Change"),
                    new CategoryMapping("Change", "Patch Release"),
                    new CategoryMapping("Change", "Emergency Change"),
                    // Development Task
                    new CategoryMapping("Development Task", "Requirement Analysis"),
                    new CategoryMapping("Development Task", "Issue Analysis"),
                    new CategoryMapping("Development Task", "Code Analysis"),
                    new CategoryMapping("Development Task", "Development"),
                    new CategoryMapping("Development Task", "Bug Fix"),
                    new CategoryMapping("Development Task", "Testing"),
                    new CategoryMapping("Development Task", "Code Review"),
                    new CategoryMapping("Development Task", "UAT Support"),
                    new CategoryMapping("Development Task", "Automation"),
                    new CategoryMapping("Development Task", "Integration"),
                    // Operational Task
                    new CategoryMapping("Operational Task", "Follow-up"),
                    new CategoryMapping("Operational Task", "Monitoring"),
                    new CategoryMapping("Operational Task", "Documentation"),
                    new CategoryMapping("Operational Task", "Coordination"),
                    new CategoryMapping("Operational Task", "Meetings"),
                    new CategoryMapping("Operational Task", "Validation"),
                    new CategoryMapping("Operational Task", "Reporting"),
                    new CategoryMapping("Operational Task", "Support Activity"),
                    // Enhancement
                    new CategoryMapping("Enhancement", "Improvement"),
                    new CategoryMapping("Enhancement", "New Feature"),
                    new CategoryMapping("Enhancement", "Revamp"),
                    // Problem
                    new CategoryMapping("Problem", "Problem Analysis"),
                    new CategoryMapping("Problem", "Recurring Issue"),
                    new CategoryMapping("Problem", "Performance Analysis"),
                    new CategoryMapping("Problem", "Root Cause Analysis"),
                    // Security
                    new CategoryMapping("Security", "Vulnerability"),
                    new CategoryMapping("Security", "Access Violation"),
                    new CategoryMapping("Security", "Security Incident")
                );
                categoryMappingRepository.saveAll(mappings);
            }

            if (userRepository.count() == 0) {
                System.out.println("Initializing sample users...");
                User u1 = new User("Admin", "Admin User", "Administrator", "Active", "root123");
                u1.setRecoveryQuestion("First pet's name?");
                u1.setRecoveryAnswer("buddy");

                User u2 = new User("John.D", "John Doe", "Support Specialist", "Active", "user123");
                u2.setRecoveryQuestion("Favorite color?");
                u2.setRecoveryAnswer("blue");

                User u3 = new User("Sarah.M", "Sarah Miller", "L2 Engineer", "Active", "user123");
                u3.setRecoveryQuestion("Birth city?");
                u3.setRecoveryAnswer("london");

                User u4 = new User("Support.Alpha", "Alpha Support", "Standard User", "Active", "user123");
                u4.setRecoveryQuestion("Favorite food?");
                u4.setRecoveryAnswer("pizza");

                userRepository.saveAll(Arrays.asList(u1, u2, u3, u4));
            }

            if (projectRepository.count() == 0) {
                System.out.println("Initializing sample projects...");
                Project p1 = new Project("HR-Portal");
                p1.setDescription("Human Resources Management System");
                
                Project p2 = new Project("E-Commerce");
                p2.setDescription("Online Shopping Platform");
                
                Project p3 = new Project("Internal-CRM");
                p3.setDescription("Customer Relationship Management");
                
                Project p4 = new Project("Mobile-App");
                p4.setDescription("Native Android and iOS Apps");

                projectRepository.saveAll(Arrays.asList(p1, p2, p3, p4));
            }

            if (taskRepository.count() == 0) {
                System.out.println("Initializing sample data...");
                
                SupportTask task1 = new SupportTask();
                task1.setTicketId("INC-1001");
                task1.setProjectId("HR-Portal");
                task1.setSupportLevel("L1");
                task1.setPriority("P3");
                task1.setGenerationDate(LocalDateTime.now().minusDays(2));
                task1.setResponseDate(LocalDateTime.now().minusDays(2).plusHours(1));
                task1.setStatus("In-Progress");
                task1.setDescription("Cannot access salary slip module");
                task1.setAssignedTo("Sarah.M");
                task1.setCreatedBy("Admin");
                
                SupportTask task2 = new SupportTask();
                task2.setTicketId("INC-1002");
                task2.setProjectId("E-Commerce");
                task2.setSupportLevel("L2");
                task2.setPriority("P1");
                task2.setGenerationDate(LocalDateTime.now().minusDays(1));
                task2.setResponseDate(LocalDateTime.now().minusDays(1).plusMinutes(15));
                task2.setClosureDate(LocalDateTime.now().minusHours(2));
                task2.setStatus("Closed");
                task2.setUserIntimated(true);
                task2.setDescription("Checkout gateway timeout");
                task2.setSolution("Restarted payment service and cleared cache");
                task2.setRemarks("Issue resolved permanently");
                task2.setAssignedTo("Admin");
                task2.setCreatedBy("Sarah.M");

                taskRepository.saveAll(Arrays.asList(task1, task2));
                System.out.println("Sample data initialized.");
            }
        };
    }
}
