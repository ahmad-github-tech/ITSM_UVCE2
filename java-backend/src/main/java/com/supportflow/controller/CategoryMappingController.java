package com.supportflow.controller;

import com.supportflow.entity.CategoryMapping;
import com.supportflow.repository.CategoryMappingRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/categories")
@CrossOrigin(origins = "*")
public class CategoryMappingController {

    @Autowired
    private CategoryMappingRepository categoryMappingRepository;

    @GetMapping
    public List<CategoryMapping> getAllCategories() {
        return categoryMappingRepository.findAll();
    }

    @PostMapping
    public CategoryMapping createCategoryMapping(@RequestBody CategoryMapping categoryMapping) {
        return categoryMappingRepository.save(categoryMapping);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteCategoryMapping(@PathVariable Long id) {
        if (categoryMappingRepository.existsById(id)) {
            categoryMappingRepository.deleteById(id);
            return ResponseEntity.noContent().build();
        } else {
            return ResponseEntity.notFound().build();
        }
    }
}
