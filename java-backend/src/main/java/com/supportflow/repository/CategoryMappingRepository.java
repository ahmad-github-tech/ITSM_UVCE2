package com.supportflow.repository;

import com.supportflow.entity.CategoryMapping;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CategoryMappingRepository extends JpaRepository<CategoryMapping, Long> {
}
